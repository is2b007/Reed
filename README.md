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

This repository currently contains the product and design foundation. Application code has not been scaffolded yet.

- [docs/PRODUCT_BRIEF.md](docs/PRODUCT_BRIEF.md): condensed build specification and delivery order
- [docs/VISUAL_REFERENCES.md](docs/VISUAL_REFERENCES.md): visual research and screen-by-screen takeaways
- [DESIGN.md](DESIGN.md): initial product design system
- [AGENTS.md](AGENTS.md): implementation rules for future contributors and coding agents

## Direction of truth

SQLite is the canonical source of truth. Reed exports deterministic plain-text project JSON for Git and Pixel Crushers DialogueDatabase JSON for Unity. Unity data is generated and must not be hand-edited. There is no Unity-to-Reed round trip.

## Planned repository shape

```text
apps/
  editor/          React + TypeScript desktop editor
  mcp/             local MCP entrypoint
  cli/             local CLI entrypoint
packages/
  core/            data access, rules, validation, backups, exports
  schema/          shared graph and tool schemas
  ui/              Reed UI primitives and tokens
fixtures/
  pixel-crushers/  golden files from verified Unity round trips
docs/
```

The first implementation milestone is a CLI-proven vertical slice: create a project and conversation, add and link dialogue nodes, persist stable IDs in SQLite WAL mode, validate, back up, and export a Pixel Crushers-compatible JSON fixture.
