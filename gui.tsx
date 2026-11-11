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
      "panel.empty": "Type words and press Enter. All words must appear in the same message.",
      "panel.none": "No matches.",
    },
    es: {
      "command.open": "Buscar en el historial",
      "panel.title": "Historial",
      "panel.placeholder": "Buscar en todas las sesiones…",
      "panel.button": "Buscar",
      "panel.empty": "Escribí palabras y Enter. Tienen que aparecer todas en el mismo mensaje.",
      "panel.none": "Sin coincidencias.",
    },
  },
  setup(ctx) {
    const [results, setResults] = createSignal<Row[]>([])
    const [busy, setBusy] = createSignal(false)
    const [touched, setTouched] = createSignal(false)
    const [text, setText] = createSignal("")

    const run = async (query: string) => {
      const q = query.trim()
      if (!q) return
      setBusy(true)
      setTouched(true)
      try {
        const out: any = await (ctx.client as any).rpc(GlobalSearch).search({ query: q, limit: 60 })
        setResults(out?.results ?? [])
      } catch {
        setResults([])
      } finally {
        setBusy(false)
      }
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
              background: "#1b1b1b",
              color: "#ddd",
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

        <div style={{ flex: "1", overflow: "auto", padding: "0 8px 8px", "min-height": "0" }}>
          <Show when={results().length > 0} fallback={
            <div style={{ color: "#666", "font-size": "12px", padding: "12px 4px" }}>
              {touched() ? ctx.t("panel.none") : ctx.t("panel.empty")}
            </div>
          }>
            <For each={results()}>
              {(r) => (
                <div style={{ "border-bottom": "1px solid #262626", padding: "8px 2px" }}>
                  <div style={{ color: "#8ab", "font-size": "11px" }}>
                    {date(r.t)} · {r.title ?? "(untitled)"} · {r.role ?? "?"} · {r.sid}
                  </div>
                  <div style={{ color: "#bbb", "font-size": "12px", "line-height": "1.4" }}>{r.excerpt}</div>
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
