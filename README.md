# Reed

Reed is a completely offline branching-dialogue workstation for Unity projects using Pixel Crushers Dialogue System. It combines a visual Electron editor, a local stdio MCP server for external agents, a scriptable CLI, and one shared SQLite/WAL core.

The application has no accounts, login, telemetry, updater, cloud storage, hosted service, remote asset, or embedded LLM client. An external agent may contact its own configured model endpoint, then call Reed locally through MCP or the CLI; Reed itself never makes a network request.

## What is included

- Dense React Flow graph editing with line, choice, group, and cross-conversation links; any two configured languages side by side; per-line spoken-language selection; permanent Line IDs; protected Final content; and text-only playtest.
- Project navigator, beat map, cast and variable registries, global local search, translation coverage, validation dashboard, review snapshots, read view, voice budget, and hot reload of CLI/MCP mutations.
- SQLite WAL storage, migrations, optimistic concurrency, append-only mutation history, rolling and named backups, exact-confirmation restore/delete operations, and deterministic project JSON.
- Pixel Crushers single- or multi-database JSON with stable actor, variable, conversation, and entry IDs; persisted Base ID ranges; localized fields; cross-database links; canvas positions; Lua/Sequence fields; and Line-ID audio manifest.
- Unicode actor PDF, editable studio CSV/XLSX, screenplay Markdown, and word/minute budget exports for English, Greek, Italian, German, and Griko.
- MCP tools and CLI commands backed exclusively by `@reed/core`, with agent status limits and stale-write protection.

## Install and verify

Reed currently targets Node 22+ and pnpm 11. Dependency installation is the development/build step that may use a network. Once built, the app, data, backups, MCP, CLI, and exports run offline.

```sh
pnpm install
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm test:offline
```

Build the reusable runtime packages:

```sh
CI=true pnpm build:runtime
```

Build the local macOS application bundle:

```sh
CI=true pnpm --filter @reed/editor package
```

The unsigned development app is written to `apps/editor/out/Reed-darwin-arm64/Reed.app`. Signing and notarization require the distributor's Apple Developer certificate and credentials.

## Start using Reed

Create a project from the desktop welcome screen, or create one from the CLI:

```sh
CI=true pnpm reed init ./my-story --name "My Story" --slug my-story --languages en,el,it,de,griko --default-language en
CI=true pnpm reed --project ./my-story add-scene "Opening" --slug opening
CI=true pnpm reed --project ./my-story --help
```

The spec-compatible `dialogue` prefix is accepted too:

```sh
CI=true pnpm reed --project ./my-story dialogue validate
```

For the MCP server, build the runtime packages and configure the external agent to start:

```sh
node /absolute/path/to/Reed/apps/mcp/dist/index.js --project /absolute/path/to/my-story
```

Transport is stdio only. Reed does not listen on a port.

## Source of truth and local files

SQLite is canonical. A project folder contains:

```text
my-story/
  .reed/
    reed.sqlite       canonical database
    reed.sqlite-wal   SQLite write-ahead log while open
    backups/          rolling and named SQLite snapshots
  exports/
    reed-project.json deterministic Git-readable snapshot
    pixel-crushers/   Unity JSON and audio manifests
    voice/            PDF, CSV, and XLSX handoff files
    screenplay.md
```

Unity JSON is one-way generated output and is stamped `GENERATED — DO NOT HAND-EDIT`. Never make Unity's Dialogue Editor a second source of truth; make changes in Reed and export again.

## Documentation

- [Data model and graph contract](docs/DATA_MODEL.md)
- [CLI reference](docs/CLI.md)
- [MCP tool reference](docs/MCP.md)
- [MCP setup for humans](docs/MCP_SETUP.md)
- [MCP operating playbook for AI agents](docs/AI_MCP_PLAYBOOK.md)
- [Pixel Crushers export and Unity import](docs/PIXEL_CRUSHERS.md)
- [Offline contract and release acceptance](docs/OFFLINE_CONTRACT.md)
- [Architecture and completion plan](docs/BUILD_PLAN.md)
- [Editor design rationale](docs/EDITOR_DESIGN.md)
- [Visual research](docs/VISUAL_REFERENCES.md)
- [Product design system](DESIGN.md)

## Compatibility boundary

The exporter follows the documented Pixel Crushers DialogueDatabase shape and has deterministic automated coverage for localized fields, stable IDs, Base ID collision prevention, cross-links, Unicode, and manifests. A real Unity-authored Pixel Crushers fixture has not been supplied to this repository, so a Unity import/export round trip and version-specific localized-field mapping must be verified before calling a particular Pixel Crushers/Unity version certified. See the fixture checklist in [docs/PIXEL_CRUSHERS.md](docs/PIXEL_CRUSHERS.md).
