# Reed implementation rules

These rules apply to every change in this repository.

## Offline-only product

- Reed runtime code must not make outbound network requests.
- Do not add accounts, login, telemetry, update checks, cloud sync, hosted storage, remote configuration, or hosted feature flags.
- Do not load fonts, icons, scripts, styles, images, schemas, or other assets from URLs. Ship all required assets with the app.
- Do not embed an LLM client or generation UI. External agents may reach their own LLM endpoint and interact with Reed locally.
- Prefer local stdio or direct process IPC for MCP and CLI integration. Do not require a listening network service.
- Development-time package installation is allowed; installed dependencies must be vendored into distributable builds so the released product functions offline.
- Add an automated offline test before shipping any runtime entrypoint.

## Architecture

- All reads and writes go through `@reed/core`. Clients must not write raw SQL or canonical JSON.
- SQLite is canonical and uses WAL mode. Plain-text project JSON is a deterministic export, not a second source of truth.
- Every mutation increments a version, records history, and supports optimistic concurrency through `expectedVersion` where applicable.
- Line IDs and Pixel Crushers numeric mappings are permanent once issued.
- Agents cannot set text status above `Polished`. Final content is human-controlled.
- Any edit to text with recorded-or-later voice status sets voice status to `Rework`.
- Destructive actions require confirmation or a reversible undo path.

## UI

- Read `DESIGN.md` before making visual decisions.
- Optimize the primary desktop workspace for keyboard use and dense production work.
- Never encode node type, validation state, status, or speaker using color alone.
- Greek, Griko, Italian, German, and English must render correctly throughout the interface and exports.
