# opencode-global-search

Search your entire OpenCode chat history — every session, every project — from inside OpenCode.

It adds one read-only tool, `global_search`, that queries OpenCode's local SQLite database
(`opencode.db`) and returns the date, session title, role and an excerpt around each match.

Works with the desktop app, the TUI, and any other client, because tools run in the OpenCode server.

## Install

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["opencode-global-search"]
}
```

For a local checkout:

```jsonc
{
  "plugins": ["/absolute/path/to/opencode-global-search"]
}
```

## Usage

Ask in plain language:

- "Search my history for where we discussed the tablet"
- "Find sessions where I mentioned rate limiting"

Or call the tool directly:

| Parameter | Type | Description |
| --- | --- | --- |
| `query` | string (required) | Text to search for, case-insensitive |
| `since` | string | Earliest date, `YYYY-MM-DD` |
| `session` | string | Restrict to one session id (`ses_...`) |
| `role` | string | `user`, `assistant`, `synthetic` or `shell` |
| `limit` | integer | Maximum matches (default 20, max 100) |

## Output

```
3 match(es) in 1 session(s) for "NOBLEX":

2026-11-08 20:11 · visor tablet · [assistant] · ses_e431f11a5ffeMuYIsTVjIYww6D
   …Intel Medfield reference tablet… this is NOBLEX-specific hardware…
```

## Compatibility

- OpenCode 2.x (`session_message` schema).
- OpenCode 1.18.x databases (`part` / `message` schema) are also supported, detected automatically.

## Database location

Resolved in this order:

1. `OPENCODE_DB` environment variable.
2. `$XDG_DATA_HOME/opencode/opencode.db`.
3. `~/.local/share/opencode/opencode.db`.

## Privacy

The tool reads your full local chat history, which may contain secrets, paths and personal data.
It never writes to the database and sends nothing anywhere. Only the excerpts you receive become
part of the conversation, so review them before sharing a session.

## License

MIT

---

# opencode-global-search (español)

Búsqueda de texto completo en todo el historial de chats de OpenCode, desde adentro de OpenCode.

Agrega una tool de solo lectura, `global_search`, que consulta la base local (`opencode.db`) y
devuelve fecha, título de la sesión, autor y un fragmento alrededor de cada coincidencia.

## Instalación

```jsonc
// ~/.config/opencode/opencode.jsonc
{
  "plugins": ["opencode-global-search"]
}
```

## Uso

- "Buscá en el historial dónde hablé de la tablet"
- "En qué sesión mencioné rate limiting"

| Parámetro | Tipo | Descripción |
| --- | --- | --- |
| `query` | string (obligatorio) | Texto a buscar, sin distinguir mayúsculas |
| `since` | string | Fecha mínima, `YYYY-MM-DD` |
| `session` | string | Limitar a una sesión (`ses_...`) |
| `role` | string | `user`, `assistant`, `synthetic` o `shell` |
| `limit` | integer | Máximo de coincidencias (20 por defecto, tope 100) |

## Privacidad

Lee todo el historial local, que puede contener claves y datos personales. No escribe en la base
ni envía nada a ningún lado. Revisá los fragmentos antes de compartir una sesión.

## Licencia

MIT
