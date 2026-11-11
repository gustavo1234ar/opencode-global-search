import { Command, Panel, Plugin } from "@opencode/plugin/gui"
import { For, Show, createSignal } from "solid-js"
import { GlobalSearch } from "./rpc.js"

type Row = {
  t: number
  sid: string
  role: string | null
  title: string | null
  excerpt: string
}

type Group = {
  sid: string
  title: string
  count: number
  last: number
}

function pad(n: number) {
  return String(n).padStart(2, "0")
}

function date(ms: number) {
  const d = new Date(ms)
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

export default Plugin.define({
  i18n: {
    en: {
      "command.open": "Search chat history",
      "panel.title": "History",
      "panel.placeholder": "Search all sessions…",
      "panel.button": "Search",
      "panel.empty": "Type the exact phrase and press Enter.",
      "panel.none": "No matches.",
      "panel.exact": "Exact match",
      "panel.hidden": "Match is inside tool output or reasoning, not in the visible text.",
    },
    es: {
      "command.open": "Buscar en el historial",
      "panel.title": "Historial",
      "panel.placeholder": "Buscar en todas las sesiones…",
      "panel.button": "Buscar",
      "panel.empty": "Escribí la frase exacta y Enter.",
      "panel.none": "Sin coincidencias.",
      "panel.exact": "Coincidencia exacta",
      "panel.hidden": "La coincidencia está en la salida de una tool o en el razonamiento, no en el texto visible.",
    },
  },
  setup(ctx) {
    const [groups, setGroups] = createSignal<Group[]>([])
    const [snippets, setSnippets] = createSignal<Record<string, Row[]>>({})
    const [busy, setBusy] = createSignal(false)
    const [touched, setTouched] = createSignal(false)
    const [text, setText] = createSignal("")
    const [exact, setExact] = createSignal(true)
    const [lastQuery, setLastQuery] = createSignal("")
    const [expanded, setExpanded] = createSignal<Record<string, boolean>>({})

    const toggle = async (sid: string) => {
      const open = !expanded()[sid]
      setExpanded({ ...expanded(), [sid]: open })
      if (!open || snippets()[sid]) return
      try {
        const out: any = await (ctx.client as any).rpc(GlobalSearch).search({
          query: lastQuery(),
          session: sid,
          words: !exact(),
          limit: 30,
        })
        setSnippets({ ...snippets(), [sid]: out?.results ?? [] })
      } catch {
        setSnippets({ ...snippets(), [sid]: [] })
      }
    }

    const run = async (query: string) => {
      const q = query.trim()
      if (!q) return
      setBusy(true)
      setTouched(true)
      setSnippets({})
      setExpanded({})
      setLastQuery(q)
      try {
        const out: any = await (ctx.client as any).rpc(GlobalSearch).groups({
          query: q,
          words: !exact(),
        })
        setGroups(out?.sessions ?? [])
      } catch {
        setGroups([])
      } finally {
        setBusy(false)
      }
    }

    const openSession = (sid: string) => {
      try {
        const servers = (ctx as any).servers
        const ids: string[] = servers?.list?.() ?? []
        const refs = ids.map((id) => servers.get(id)).filter(Boolean)
        const server = refs.find((s: any) => s.builtin) ?? refs[0]
        if (!server) return
        ;(ctx as any).tabs.open({ server: server.id, id: sid }, { focus: true })
      } catch {}
    }

    const pieces = (value: string) => {
      const q = lastQuery().trim()
      if (!q) return [{ text: value, hit: false }]
      const terms = exact() ? [q] : q.split(/\s+/).filter(Boolean)
      if (terms.length === 0) return [{ text: value, hit: false }]
      const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")
      const re = new RegExp(`(${escaped})`, "gi")
      return value
        .split(re)
        .filter((part) => part !== "")
        .map((part, i) => ({ text: part, hit: i % 2 === 1 }))
    }

    const View = () => (
      <div style={{ display: "flex", "flex-direction": "column", height: "100%", "min-height": "0" }}>
        <div style={{ display: "flex", gap: "6px", padding: "8px" }}>
          <input
            value={text()}
            placeholder={ctx.t("panel.placeholder")}
            onInput={(e) => setText(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void run(text())
            }}
            style={{
              flex: "1",
              padding: "6px 8px",
              "border-radius": "6px",
              border: "1px solid #3a3a3a",
              background: "#ffffff",
              color: "#111111",
              "font-size": "13px",
            }}
          />
          <button
            onClick={() => void run(text())}
            disabled={busy()}
            style={{
              padding: "6px 12px",
              "border-radius": "6px",
              border: "1px solid #3a3a3a",
              background: busy() ? "#2a2a2a" : "#2b5f8f",
              color: "#fff",
              "font-size": "13px",
            }}
          >
            {ctx.t("panel.button")}
          </button>
        </div>

        <div style={{ padding: "0 8px 8px" }}>
          <label style={{ display: "flex", "align-items": "center", gap: "6px", color: "#555", "font-size": "12px" }}>
            <input type="checkbox" checked={exact()} onChange={(e) => setExact(e.currentTarget.checked)} />
            {ctx.t("panel.exact")}
          </label>
        </div>

        <div style={{ flex: "1", overflow: "auto", padding: "0 8px 8px", "min-height": "0" }}>
          <Show when={groups().length > 0} fallback={
            <div style={{ color: "#666", "font-size": "12px", padding: "12px 4px" }}>
              {touched() ? ctx.t("panel.none") : ctx.t("panel.empty")}
            </div>
          }>
            <For each={groups()}>
              {(g) => (
                <div style={{ "border-bottom": "1px solid rgba(128,128,128,0.30)" }}>
                  <div
                    onClick={() => openSession(g.sid)}
                    style={{ display: "flex", "align-items": "center", gap: "6px", padding: "8px 2px", cursor: "pointer" }}
                  >
                    <button
                      onClick={(e) => {
                        e.stopPropagation()
                        toggle(g.sid)
                      }}
                      style={{
                        border: "0",
                        background: "transparent",
                        color: "#888",
                        cursor: "pointer",
                        "font-size": "11px",
                        padding: "0 2px",
                      }}
                    >
                      {expanded()[g.sid] ? "▾" : "▸"}
                    </button>
                    <span style={{ flex: "1", color: "#8ab", "font-size": "12px", "font-weight": "600" }}>
                      {g.title || "(untitled)"}
                    </span>
                    <span style={{ color: "#666", "font-size": "11px" }}>
                      {g.count} · {date(g.last)}
                    </span>
                  </div>
                  <Show when={expanded()[g.sid]}>
                    <div style={{ "padding-bottom": "6px" }}>
                      <For each={snippets()[g.sid] ?? []}>
                        {(r) => (
                          <div style={{ padding: "4px 2px 4px 20px" }}>
                            <div style={{ color: "#666", "font-size": "11px" }}>
                              {date(r.t)} · {r.role ?? "?"}
                            </div>
                            <div style={{ color: "#333333", "font-size": "12px", "line-height": "1.4" }}>
                              <For each={pieces(r.excerpt)}>
                                {(part) => <span style={part.hit ? { "font-weight": "700", color: "#111" } : {}}>{part.text}</span>}
                              </For>
                            </div>
                          </div>
                        )}
                      </For>
                      <Show when={snippets()[g.sid]?.length === 0}>
                        <div style={{ padding: "4px 2px 4px 20px", color: "#777", "font-size": "11px" }}>
                          {ctx.t("panel.hidden")}
                        </div>
                      </Show>
                    </div>
                  </Show>
                </div>
              )}
            </For>
          </Show>
        </div>
      </div>
    )

    ctx.add(Command, () => ({
      id: "open",
      title: ctx.t("command.open"),
      bind: "mod+shift+h",
      run: () => {
        const session = (ctx as any).sessions.current()
        if (session) (ctx as any).layout.open(`${ctx.id}:main`, session)
      },
    }))

    ctx.add(Panel, {
      id: "main",
      region: "side",
      width: 420,
      list: (input) => (input.open.includes("main") ? [{ id: "main", title: ctx.t("panel.title"), closable: true }] : []),
      render: () => <View />,
    })
  },
})
