import { homedir } from "node:os"
import { join } from "node:path"
import { existsSync } from "node:fs"

export type SearchInput = {
  query: string
  since?: string
  session?: string
  role?: string
  limit?: number
}

export type SearchRow = {
  t: number
  sid: string
  role: string | null
  title: string | null
  excerpt: string
}

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

function excerpt(data: string, units: Unit[]) {
  let i = -1
  const lower = data.toLowerCase()
  for (const unit of units) {
    const found = unit.phrase ? lower.indexOf(unit.value.toLowerCase()) : termRegex(unit.value).exec(data)?.index ?? -1
    if (found >= 0 && (i < 0 || found < i)) i = found
  }
  if (i < 0) return clean(data.slice(0, 240))
  const start = Math.max(0, i - 140)
  const end = Math.min(data.length, i + 180)
  return `…${clean(data.slice(start, end))}…`
}

function visibleText(data: string, type: string | null): string {
  try {
    const parsed = JSON.parse(data)
    if (type === "assistant") {
      const parts = Array.isArray(parsed?.content) ? parsed.content : []
      return parts
        .filter((p: any) => p && p.type === "text" && typeof p.text === "string")
        .map((p: any) => p.text)
        .join("\n")
    }
    if (typeof parsed?.text === "string") return parsed.text
    if (typeof parsed?.metadata?.displayText === "string") return parsed.metadata.displayText
    return ""
  } catch {
    return ""
  }
}

type Unit = { value: string; phrase: boolean }

function parseQuery(query: string): Unit[] {
  const units: Unit[] = []
  const re = /"([^"]+)"|(\S+)/g
  let match: RegExpExecArray | null
  while ((match = re.exec(query))) {
    if (match[1] !== undefined) {
      const value = match[1].trim()
      if (value) units.push({ value, phrase: true })
    } else if (match[2]) {
      units.push({ value: match[2], phrase: false })
    }
  }
  return units
}

function termRegex(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu")
}

function matchesAll(text: string, units: Unit[]) {
  const lower = text.toLowerCase()
  return units.every((u) =>
    u.phrase ? lower.includes(u.value.toLowerCase()) : termRegex(u.value).test(text),
  )
}

export type SessionOption = {
  id: string
  title: string
  updated: number
}

export async function listSessions(limit = 300): Promise<SessionOption[]> {
  const open = await loadSqlite()
  const db = open(databasePath())
  try {
    const rows = db
      .prepare(
        "SELECT id, title, time_updated AS updated FROM session_v2 WHERE parent_id IS NULL ORDER BY time_updated DESC LIMIT ?",
      )
      .all(Math.min(Math.max(limit, 1), 1000)) as any[]
    return rows.map((r) => ({ id: r.id, title: r.title ?? "", updated: r.updated }))
  } finally {
    db.close()
  }
}

export async function searchRows(input: SearchInput): Promise<SearchRow[]> {
  const query = String(input.query ?? "").trim()
  if (!query) return []

  let sinceMs: number | undefined
  if (input.since) {
    sinceMs = Date.parse(`${input.since}T00:00:00`)
    if (Number.isNaN(sinceMs)) return []
  }

  const units = parseQuery(query)
  if (units.length === 0) return []
  const patterns = units.map((u) => `%${u.value.replace(/[\\%_]/g, (c) => `\\${c}`)}%`)
  const top = Math.min(Math.max(Number(input.limit) || 50, 1), 200)
  const fetch = Math.min(top * 40, 3000)

  const open = await loadSqlite()
  const db = open(databasePath())

  try {
    const v2 = db
      .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='session_message'")
      .get()

    const conditions: string[] = []
    const params: any[] = []

    if (v2) {
      conditions.push(patterns.map(() => "m.data LIKE ? ESCAPE '\\'").join(" AND "))
      params.push(...patterns)
      if (sinceMs !== undefined) {
        conditions.push("m.time_created >= ?")
        params.push(sinceMs)
      }
      if (input.session) {
        conditions.push("m.session_id = ?")
        params.push(input.session)
      }
      if (input.role) {
        conditions.push("m.type = ?")
        params.push(input.role)
      } else {
        conditions.push("m.type IN ('user','assistant','synthetic','shell')")
      }
      params.push(fetch)

      const sql = `SELECT m.time_created AS t, m.session_id AS sid, m.type AS role,
                          m.data AS content, s.title AS title
                   FROM session_message m
                   LEFT JOIN session_v2 s ON s.id = m.session_id
                   WHERE ${conditions.join(" AND ")}
                   ORDER BY m.time_created DESC LIMIT ?`
      const rows = db.prepare(sql).all(...params) as any[]
      return rows
        .map((r) => ({ r, text: visibleText(String(r.content), r.role) }))
        .filter((x) => matchesAll(x.text, units))
        .slice(0, top)
        .map((x) => ({
          t: x.r.t,
          sid: x.r.sid,
          role: x.r.role ?? "",
          title: x.r.title ?? "",
          excerpt: excerpt(x.text, units),
        }))
    }

    conditions.push(patterns.map(() => "p.data LIKE ? ESCAPE '\\'").join(" AND "))
    params.push(...patterns)
    if (sinceMs !== undefined) {
      conditions.push("p.time_created >= ?")
      params.push(sinceMs)
    }
    if (input.session) {
      conditions.push("p.session_id = ?")
      params.push(input.session)
    }
    if (input.role) {
      conditions.push("json_extract(m.data, '$.role') = ?")
      params.push(input.role)
    } else {
      conditions.push("json_extract(m.data, '$.role') IN ('user','assistant')")
    }
    params.push(fetch)

    const sql = `SELECT p.time_created AS t, p.session_id AS sid,
                        json_extract(m.data, '$.role') AS role,
                        p.data AS content, s.title AS title
                 FROM part p
                 JOIN message m ON m.id = p.message_id
                 LEFT JOIN session s ON s.id = p.session_id
                 WHERE ${conditions.join(" AND ")}
                 ORDER BY p.time_created DESC LIMIT ?`
    const rows = db.prepare(sql).all(...params) as any[]
    return rows
      .map((r) => ({ r, text: visibleText(String(r.content), r.role) }))
      .filter((x) => matchesAll(x.text, units))
      .slice(0, top)
      .map((x) => ({
        t: x.r.t,
        sid: x.r.sid,
        role: x.r.role ?? "",
        title: x.r.title ?? "",
        excerpt: excerpt(x.text, units),
      }))
  } finally {
    db.close()
  }
}
