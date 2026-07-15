# Reed

Reed is an offline-first branching dialogue authoring toolkit for Unity projects that use Pixel Crushers Dialogue System. It is designed as a serious production workstation for narrative design, localization, review, validation, voice production, and deterministic export.

The intended system has one shared TypeScript core and three thin clients:

- a React editor for the visual and human review workflows;
- a local MCP server for external agents;
- a scriptable CLI for batch work and CI.

## Non-negotiable offline boundary

Reed itself never makes network calls. The editor, shared core, local MCP server, Reed CLI, SQLite store, backups, and every export must work with the machine completely offline. There are no accounts, logins, telemetry, hosted services, remote fonts, CDNs, or cloud storage.

An external agent may contact its separately configured LLM endpoint during generation, then call Reed through local MCP/CLI boundaries. That network activity is outside Reed. Reed does not contain an LLM client or generation UI.

See [docs/OFFLINE_CONTRACT.md](docs/OFFLINE_CONTRACT.md) for the testable policy.

## Current status

The first executable slice is working. The pnpm/TypeScript workspace contains the shared schema, SQLite core, and local CLI. The core currently supports project hierarchy, conversations and graph links, multilingual text, permanent Line IDs, persistent numeric IDs, mutation history, optimistic concurrency, production guardrails, search, validation, rolling/named backups, and deterministic Reed JSON export.

- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md): condensed build specification and delivery order
- [docs/BUILD_PLAN.md](docs/BUILD_PLAN.md): locked architecture and phased delivery plan
- [docs/VISUAL_REFERENCES.md](docs/VISUAL_REFERENCES.md): visual research and screen-by-screen takeaways
- [DESIGN.md](DESIGN.md): initial product design system
- [AGENTS.md](AGENTS.md): implementation rules for future contributors and coding agents

Install and verify the local workspace:

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm build
```

Start a project and inspect the command surface:

```sh
pnpm reed init ./my-story --name "My Story" --slug my-story
pnpm reed --project ./my-story add-scene "Opening" --slug opening
pnpm reed --help
```

## Direction of truth

SQLite is the canonical source of truth. Reed exports deterministic plain-text project JSON for Git and Pixel Crushers DialogueDatabase JSON for Unity. Unity data is generated and must not be hand-edited. There is no Unity-to-Reed round trip.

## Planned repository shape

```text
apps/
  editor/          React + TypeScript desktop editor
  mcp/             local MCP entrypoint
packages/
  cli/             local CLI entrypoint
  core/            data access, rules, validation, backups, exports
  schema/          shared graph and tool schemas
  ui/              Reed UI primitives and tokens
fixtures/
  pixel-crushers/  golden files from verified Unity round trips
docs/
```

The next milestone is the fixture-gated Pixel Crushers exporter. Compatibility will only be claimed after a Unity-authored sample passes import, export, localized-field, split-database, Base ID, and cross-database-link tests.
