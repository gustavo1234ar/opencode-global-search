# CONTEXTO — opencode-global-search

Documento de traspaso. Si retomás el proyecto en otra sesión, leé esto primero.

## Qué es

Plugin de OpenCode 2.x que busca dentro del historial de todos los chats.
OpenCode solo busca por título de sesión (Ctrl+P) y con Ctrl+F dentro del chat abierto; no hay búsqueda global en el contenido.

- Carpeta: `C:\Users\Gustavo\Documents\opencode-global-search`
- Repo (público): https://github.com/gustavo1234ar/opencode-global-search
- npm (público): `opencode-global-search`, última `0.1.10`

## Cómo está armado

Un solo paquete con tres partes:

| Archivo | Rol |
| --- | --- |
| `search.ts` | Lógica: abre `opencode.db` en **solo lectura**, busca, cuenta por sesión |
| `rpc.ts` | Contrato RPC (`Rpc.define`) entre panel y servidor |
| `index.ts` | Parte servidor: tool `global_search` + registro del RPC. Id: `global-search` |
| `gui.tsx` | Panel de la app de escritorio (SolidJS) |
| `dist/gui-experimental.cjs` | Panel compilado (`npm run build`) |

`package.json` exporta `.`, `./rpc` y `./gui-experimental`.

## Cómo se usa

- **Panel (principal):** `Ctrl+Shift+H` o palette → "Buscar en el historial". No gasta tokens.
- **Tool (opcional):** el agente puede llamar `global_search`.
- Apagar la tool: `"plugins": [{ "package": "...", "options": { "tool": false } }]`.

## Base de datos

Ruta: `OPENCODE_DB` → `$XDG_DATA_HOME/opencode/opencode.db` → `~/.local/share/opencode/opencode.db`.

Esquema v2 (el que usa hoy): `session_v2` + `session_message` (una fila por mensaje).
Cada fila tiene `data` (JSON) que mezcla **texto visible + razonamiento + salida de tools**.

- `type`: `user`, `assistant`, `synthetic`, `shell`, `system`…
- Texto visible: `$.text` (usuario) o las partes `type="text"` de `$.content` (agente).
- Fallback v1: `session` / `message` / `part` (partes `type="text"`).

**Regla clave:** buscar y contar solo sobre texto visible. El razonamiento y las tools no cuentan.

## Decisiones tomadas (y por qué)

- **Frase exacta por defecto** (como el Ctrl+F nativo, que hace `indexOf` del texto en minúsculas).
- **Modo "palabras sueltas"** con checkbox **"Coincidencia exacta"** (destildado por defecto): todas las palabras, en cualquier orden, en el mismo mensaje.
- **Resultados agrupados por sesión** con conteo y fecha de la última coincidencia; el conteo se hace en SQL (`GROUP BY session_id`) usando solo texto visible.
- **Fragmentos bajo demanda**: al desplegar una sesión se piden hasta 30.
- **Orden por cercanía** entre las palabras; el fragmento se centra donde aparecen juntas y las palabras se resaltan en negrita.
- **Sin selector de sesión** (redundante con Ctrl+F).
- **Sin límite de sesiones**: el conteo es SQL; los fragmentos se cargan por sesión.
- El panel conserva la última búsqueda mientras la app está abierta.
- La tool devuelve texto plano para el agente (límite 20 por defecto, 100 máx).

## Gotchas

- `Rpc.define` necesita `errors: {}` en cada método y `events: {}` arriba; sin eso el plugin falla al cargar con `Object.entries ... null`.
- Los esquemas JSON del RPC no aceptan `type: ["string","null"]`.
- Al editar archivos, el servidor recarga el plugin solo (watcher). Si algo queda raro: `opencode service restart`.
- El bundle del panel se recarga en cada build; no hace falta reiniciar la app.
- Logs: `~/.local/share/opencode/log/opencode.log` (`failed to load plugin`, `rpc register failed`).
- Config: `C:\Users\Gustavo\.config\opencode\opencode.jsonc`. Hoy apunta a la **carpeta local**, no a npm:
  `"plugins": ["C:/Users/Gustavo/Documents/opencode-global-search"]`
- Comando `/search` en `~/.config/opencode/commands/search.md` (usa la tool).

## Publicar

```
cd C:\Users\Gustavo\Documents\opencode-global-search
npm run build
npm publish --access public
```

Requiere 2FA: la cuenta tiene security key con **Windows Hello (PIN)**. El publish abre el navegador para autenticar.
Subir antes la versión en `package.json` (`npm version patch --no-git-tag-version`).

## Pendientes / ideas

- Probar el camino v1 (`part`/`message`): no hay base v1 para testear.
- Saltar al mensaje exacto desde el panel: no hay API; solo Ctrl+F dentro del chat.
- Badges de npm en el README.
- Tests automatizados.
- El README está en inglés con sección en español.
