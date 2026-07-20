# Reed build plan

## Locked decisions

- Electron + Electron Forge for the desktop editor; React runs in a sandboxed renderer and receives a narrow typed API through `contextBridge`.
- pnpm workspace with TypeScript packages. No web server is required at runtime.
- `better-sqlite3` in WAL mode behind `@reed/core`; Forge rebuilds the native module for packaged Electron targets.
- macOS arm64 and Windows x64 are desktop distribution targets. Both package the same sandboxed renderer and rebuild `better-sqlite3` for the target runtime.
- MCP uses stdio only and the stable v1 TypeScript SDK until MCP v2 leaves beta.
- Pixel Crushers export is fixture-gated. No exporter is called compatible until a Unity-authored database has passed import, export, and two-database collision tests.

## Runtime dependency graph

```text
Electron renderer ── typed IPC ── Electron main ─┐
                                                  │
External agent ── stdio ── Reed MCP ─────────────┼── @reed/core ── SQLite WAL
                                                  │                    │
Terminal / CI ───────────── Reed CLI ─────────────┘                    ├── backups
                                                                       └── exports
```

The renderer, MCP server, and CLI never issue SQL. All mutation rules, status guards, validation, version checks, permanent IDs, history records, backups, and exports live in `@reed/core`.

## Data and concurrency model

- A Reed project is a user-selected folder containing `.reed/reed.sqlite`, `.reed/backups/`, and deterministic `exports/`.
- Conversation graph mutations use the conversation as their versioned aggregate. Project registries use the project version.
- `expectedVersion` is optional. A mismatch returns the current version plus mutation-log entries since the expected version.
- Every successful mutation and its before/after payload are appended to `mutation_log` in the same transaction.
- The editor polls the mutation log by sequence number. External changes reload only the affected aggregate; conflicting unsaved UI state is held for explicit resolution.
- SQLite writes use short `BEGIN IMMEDIATE` transactions, a bounded busy wait, foreign keys, and WAL checkpoints at idle boundaries.

## Delivery status

1. **Complete — CLI-proven core:** schemas, migrations, hierarchy, conversations, permanent IDs, links, multilingual text, status rules, validation, mutation history, backups, deterministic project JSON, import, search, review snapshots, restore, and CLI.
2. **Implemented, fixture certification pending — Pixel Crushers contract:** JSON export, localized mapping override, split databases, persisted Base ID ranges, cross-database links, audio manifest, and collision validation are implemented and tested. A licensed Unity-authored fixture is still required for version-specific round-trip certification.
3. **Complete — Local MCP:** stable v1 SDK over stdio, read/mutation/import/export tools, schema resource, structured errors, stale-write handling, and agent guardrails.
4. **Complete — Editor foundation:** packaged Electron shell, runtime egress denial, project picker, navigator, React Flow editing, inspector, cast/variable registry, and beat map.
5. **Complete for the production vertical slice:** playtest, search/jump, usage counts, validation/jump, review approval, translation coverage/editing, verification states, dual language, and external-change reload. Advanced multi-line bulk selection remains a future efficiency enhancement, not a data-model dependency.
6. **Complete except external signing credentials — Handoff and distribution:** screenplay Markdown/read view, VO budget, Unicode PDF/CSV/XLSX, locally signed arm64 macOS DMG/ZIP, unsigned Windows x64 ZIP, target-native module packaging checks, and offline acceptance. Apple notarization and Windows code signing require distributor certificates.

## Quality gates

- Unit tests for every pure rule and state transition.
- Integration tests use real temporary SQLite databases and at least two concurrent processes/connections.
- CLI tests exercise human and JSON output with real files.
- Editor tests cover typed IPC contracts and Playwright Electron flows.
- Exporters use golden files and deterministic byte-for-byte comparisons.
- Release tests deny outbound networking, scan packaged assets for remote URLs, and run create/edit/reopen/backup/restore/export workflows without a connection.

## Deliberate boundaries

- Pixel Crushers version certification is blocked on a real Unity-authored sample, not on exporter implementation.
- Windows code signing, Apple distribution signing/notarization, and Linux distribution require target runners or owner credentials.
- Optional local push into a Unity project is not required; local JSON import remains the supported one-way path.
- LLM prompts, credentials, model SDKs, accounts, telemetry, and hosted services are permanently out of scope.
