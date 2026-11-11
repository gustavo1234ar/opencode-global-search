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
  const found = locate(data, units)
  if (!found) return clean(data.slice(0, 240))
  const start = Math.max(0, found.start - 120)
  const end = Math.min(data.length, found.end + 160)
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
  const trimmed = query.trim()
  return trimmed ? [{ value: trimmed, phrase: true }] : []
}

function termRegex(term: string) {
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
  return new RegExp(`(?<![\\p{L}\\p{N}_])${escaped}(?![\\p{L}\\p{N}_])`, "iu")
}

function occurrences(text: string, unit: Unit): number[] {
  const out: number[] = []
  if (unit.phrase) {
    const lower = text.toLowerCase()
    const needle = unit.value.toLowerCase()
    let i = lower.indexOf(needle)
    while (i >= 0 && out.length < 40) {
      out.push(i)
      i = lower.indexOf(needle, i + needle.length)
    }
    return out
  }
  const re = new RegExp(termRegex(unit.value).source, "giu")
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) && out.length < 40) {
    out.push(m.index)
    re.lastIndex = m.index + Math.max(1, m[0].length)
  }
  return out
}

const MAX_SPAN = 600

function locate(text: string, units: Unit[]): { start: number; end: number; span: number } | null {
  const all: { at: number; len: number; unit: number }[] = []
  units.forEach((u, idx) => {
    for (const at of occurrences(text, u)) {
      all.push({ at, len: u.value.length, unit: idx })
    }
  })
  if (all.length === 0) return null
  all.sort((a, b) => a.at - b.at)

  const counts = new Array(units.length).fill(0)
  let have = 0
  let left = 0
  let best: { start: number; end: number; span: number } | null = null

  for (let right = 0; right < all.length; right++) {
    if (counts[all[right].unit]++ === 0) have++
    while (have === units.length) {
      const start = all[left].at
      const end = all[right].at + all[right].len
      const span = end - start
      if (!best || span < best.span) best = { start, end, span }
      if (--counts[all[left].unit] === 0) have--
      left++
    }
  }
  return best
}

function matchesAll(text: string, units: Unit[]) {
  return locate(text, units) !== null
}

export type SessionOption = {
  id: string
  title: string
  updated: number
}

export type SessionGroup = {
  sid: string
  title: string
  count: number
  last: number
}

export async function searchSessions(input: SearchInput): Promise<SessionGroup[]> {
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

      const sql = `SELECT m.session_id AS sid, COUNT(*) AS n, MAX(m.time_created) AS last, s.title AS title
                   FROM session_message m
                   LEFT JOIN session_v2 s ON s.id = m.session_id
                   WHERE ${conditions.join(" AND ")}
                   GROUP BY m.session_id
                   ORDER BY n DESC, last DESC`
      const rows = db.prepare(sql).all(...params) as any[]
      return rows.map((r) => ({ sid: r.sid, title: r.title ?? "", count: r.n, last: r.last }))
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

    const sql = `SELECT p.session_id AS sid, COUNT(*) AS n, MAX(p.time_created) AS last, s.title AS title
                 FROM part p
                 JOIN message m ON m.id = p.message_id
                 LEFT JOIN session s ON s.id = p.session_id
                 WHERE ${conditions.join(" AND ")}
                 GROUP BY p.session_id
                 ORDER BY n DESC, last DESC`
    const rows = db.prepare(sql).all(...params) as any[]
    return rows.map((r) => ({ sid: r.sid, title: r.title ?? "", count: r.n, last: r.last }))
  } finally {
    db.close()
  }
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
  const fetch = Math.min(Math.max(top * 40, 600), 3000)

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
