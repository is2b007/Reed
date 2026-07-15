# Reed build plan

## Locked decisions

- Electron + Electron Forge for the desktop editor; React runs in a sandboxed renderer and receives a narrow typed API through `contextBridge`.
- pnpm workspace with TypeScript packages. No web server is required at runtime.
- `better-sqlite3` in WAL mode behind `@reed/core`; Forge rebuilds the native module for packaged Electron targets.
- macOS arm64 and x64 are the first signed distribution targets. Windows follows after the same offline acceptance suite passes there.
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

## Delivery phases

1. **CLI-proven core:** schemas, migrations, hierarchy, conversations, permanent Line IDs and numeric mappings, links, multilingual text, status rules, validation, mutation history, rolling/named backups, deterministic project JSON, and CLI commands.
2. **Pixel Crushers contract:** obtain a Unity-authored fixture, implement native JSON export, verify localized field mapping, split databases, Base ID ranges, cross-database links, and Unity round trips.
3. **Local MCP:** mirror core commands over stdio, publish `get_schema`, enforce agent guardrails, and test stale-write failures.
4. **Editor foundation:** Electron shell, offline guard, project picker, navigator, React Flow canvas, inspector, characters, and beat map.
5. **Production workspaces:** playtest, search, usage, validation, variables, review snapshots, bulk operations, translation, and verification.
6. **Handoff and distribution:** screenplay, VO budget, PDF/CSV/XLSX packages, signed macOS installers, packaged help, and offline acceptance testing.

## Quality gates

- Unit tests for every pure rule and state transition.
- Integration tests use real temporary SQLite databases and at least two concurrent processes/connections.
- CLI tests exercise human and JSON output with real files.
- Editor tests cover typed IPC contracts and Playwright Electron flows.
- Exporters use golden files and deterministic byte-for-byte comparisons.
- Release tests deny outbound networking, scan packaged assets for remote URLs, and run create/edit/reopen/backup/restore/export workflows without a connection.

## Not in the first milestone

- Electron UI and MCP server: they follow only after the CLI proves the shared core.
- Pixel Crushers compatibility claims: blocked on a real Unity-authored sample.
- Windows/Linux installers, signing, and notarization.
- Optional local push into a Unity project.
- LLM prompts, credentials, model SDKs, accounts, telemetry, or hosted services.
