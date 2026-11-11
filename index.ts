import { Plugin } from "@opencode/plugin"
import { searchRows, listSessions } from "./search.js"
import { GlobalSearch } from "./rpc.js"

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

export default Plugin.define({
  id: "global-search",
  async setup(ctx) {
    const exposeTool = (ctx.options as any)?.tool !== false

    if (exposeTool) {
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

          const rows = await searchRows({
            query: term,
            since,
            session,
            role,
            limit: Math.min(Number(limit) || 20, 100),
          })

          if (rows.length === 0) return { content: `No matches for "${term}".` }

          const sessions = new Set(rows.map((r) => r.sid)).size
          const lines = rows.map((r) => {
            const who = ROLE_LABEL[r.role ?? ""] ?? r.role ?? "unknown"
            const title = (r.title ?? "(untitled)").replace(/\s+/g, " ").slice(0, 60)
            return `${formatDate(r.t)} · ${title} · [${who}] · ${r.sid}\n   ${r.excerpt}`
          })

          return {
            content: `${rows.length} match(es) in ${sessions} session(s) for "${term}":\n\n${lines.join("\n\n")}`,
          }
        },
      })
      })
    }

    try {
      await ctx.rpc.register(GlobalSearch, {
        search: async (input: any) => {
          const results = await searchRows({
            query: String(input?.query ?? ""),
            since: input?.since,
            session: input?.session,
            role: input?.role,
            limit: Math.min(Math.max(Number(input?.limit) || 50, 1), 200),
          })
          return { results }
        },
        sessions: async (input: any) => {
          const sessions = await listSessions(Math.min(Math.max(Number(input?.limit) || 300, 1), 1000))
          return { sessions }
        },
      })
    } catch (error) {
      console.error("[global-search] rpc register failed:", error)
    }
  },
})
