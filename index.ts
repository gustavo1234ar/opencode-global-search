import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"
import { Plugin } from "@opencode/plugin"

function databasePath(): string {
  const fromEnv = process.env.OPENCODE_DB
  if (fromEnv && existsSync(fromEnv)) return fromEnv

  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "opencode.db")
}

async function loadSqlite() {
  try {
    const mod: any = await import("node:sqlite")
    return (path: string) => new mod.DatabaseSync(path, { readOnly: true })
  } catch {
    const mod: any = await import("bun:sqlite")
    return (path: string) => new mod.Database(path, { readonly: true })
  }
}

type Row = {
  t: number
  sid: string
  role: string | null
  title: string | null
  content: string
}

const ROLE_LABEL: Record<string, string> = {
  user: "user",
  assistant: "assistant",
  synthetic: "system",
  system: "system",
  shell: "shell",
}

function formatDate(ms: number) {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, "0")
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

function clean(text: string) {
  return text
    .replace(/\\n/g, " ")
    .replace(/\\r/g, " ")
    .replace(/\\t/g, " ")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\")
    .replace(/\s+/g, " ")
    .trim()
}

function excerpt(data: string, term: string) {
  const i = data.toLowerCase().indexOf(term.toLowerCase())
  if (i < 0) return clean(data.slice(0, 240))
  const start = Math.max(0, i - 140)
  const end = Math.min(data.length, i + term.length + 160)
  return `…${clean(data.slice(start, end))}…`
}

export default Plugin.define({
  id: "global-search",
  async setup(ctx) {
    const open = await loadSqlite()

    await ctx.tool.transform((editor) => {
      editor.namespace({
        name: "global",
        description: "Full-text search across OpenCode chat history",
      })

      editor.add({
        name: "global_search",
        description:
          "Search every OpenCode session for a term and return the date, session title, role and an excerpt around each match. Read-only.",
        input: {
          type: "object",
          properties: {
            query: { type: "string", description: "Text to search for (case-insensitive)" },
            since: { type: "string", description: "Earliest date, YYYY-MM-DD" },
            session: { type: "string", description: "Restrict to one session id (ses_...)" },
            role: {
              type: "string",
              enum: ["user", "assistant", "synthetic", "shell"],
              description: "Restrict to message author",
            },
            limit: { type: "integer", description: "Maximum matches (default 20, max 100)" },
          },
          required: ["query"],
          additionalProperties: false,
        },
        execute: async (input) => {
          const { query, since, session, role, limit } = input as {
            query: string
            since?: string
            session?: string
            role?: string
            limit?: number
          }

          const term = String(query ?? "").trim()
          if (!term) return { content: "Missing search term." }

          let sinceMs: number | undefined
          if (since) {
            sinceMs = Date.parse(`${since}T00:00:00`)
            if (Number.isNaN(sinceMs)) return { content: `Invalid date: ${since} (use YYYY-MM-DD).` }
          }

          const pattern = `%${term.replace(/[\\%_]/g, (c) => `\\${c}`)}%`
          const top = Math.min(Math.max(Number(limit) || 20, 1), 100)

          const db = open(databasePath())
          let rows: Row[]
          try {
            const v2 = db
              .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_message'")
              .get()

            const conditions: string[] = []
            const params: any[] = []

            if (v2) {
              conditions.push("m.data LIKE ? ESCAPE '\\'")
              params.push(pattern)
              if (sinceMs !== undefined) {
                conditions.push("m.time_created >= ?")
                params.push(sinceMs)
              }
              if (session) {
                conditions.push("m.session_id = ?")
                params.push(session)
              }
              if (role) {
                conditions.push("m.type = ?")
                params.push(role)
              } else {
                conditions.push("m.type IN ('user','assistant','synthetic','shell')")
              }
              params.push(top)

              const sql = `SELECT m.time_created AS t, m.session_id AS sid, m.type AS role,
                                  m.data AS content, s.title AS title
                           FROM session_message m
                           LEFT JOIN session_v2 s ON s.id = m.session_id
                           WHERE ${conditions.join(" AND ")}
                           ORDER BY m.time_created DESC LIMIT ?`
              rows = db.prepare(sql).all(...params) as Row[]
            } else {
              conditions.push("p.data LIKE ? ESCAPE '\\'")
              params.push(pattern)
              if (sinceMs !== undefined) {
                conditions.push("p.time_created >= ?")
                params.push(sinceMs)
              }
              if (session) {
                conditions.push("p.session_id = ?")
                params.push(session)
              }
              if (role) {
                conditions.push("json_extract(m.data, '$.role') = ?")
                params.push(role)
              } else {
                conditions.push("json_extract(m.data, '$.role') IN ('user','assistant')")
              }
              params.push(top)

              const sql = `SELECT p.time_created AS t, p.session_id AS sid,
                                  json_extract(m.data, '$.role') AS role,
                                  p.data AS content, s.title AS title
                           FROM part p
                           JOIN message m ON m.id = p.message_id
                           LEFT JOIN session s ON s.id = p.session_id
                           WHERE ${conditions.join(" AND ")}
                           ORDER BY p.time_created DESC LIMIT ?`
              rows = db.prepare(sql).all(...params) as Row[]
            }
          } finally {
            db.close()
          }

          if (rows.length === 0) return { content: `No matches for "${term}".` }

          const sessions = new Set(rows.map((r) => r.sid)).size
          const lines = rows.map((r) => {
            const who = ROLE_LABEL[r.role ?? ""] ?? r.role ?? "unknown"
            const title = (r.title ?? "(untitled)").replace(/\s+/g, " ").slice(0, 60)
            return `${formatDate(r.t)} · ${title} · [${who}] · ${r.sid}\n   ${excerpt(r.content, term)}`
          })

          return {
            content: `${rows.length} match(es) in ${sessions} session(s) for "${term}":\n\n${lines.join("\n\n")}`,
          }
        },
      })
    })
  },
})
