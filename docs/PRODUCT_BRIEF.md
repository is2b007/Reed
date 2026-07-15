# Reed product brief

## Product

Reed is a local-first dialogue-authoring toolkit for a Unity game using Pixel Crushers Dialogue System. It separates dialogue structure from multilingual line content and gives narrative designers, localization reviewers, voice production, and external generation agents one safe data core.

## System shape

- `@reed/core`: typed data access, validation, stable ID generation, numeric mapping, versioning, history, backups, and exports.
- Editor: React + TypeScript visual workstation. It contains no AI generation UI.
- MCP server: local tools used by an external agent. The server never calls an LLM.
- CLI: scriptable mirror of MCP operations, with human-readable output and `--json`.
- Store: SQLite in WAL mode. Every mutation increments a version and joins backup history.

## Canonical hierarchy

`Project → Level → Scene → Conversation → DialogueNode`

Scene records mirror the external Obsidian beat map through `beatRef`. Dialogue nodes carry a permanent scene-prefixed Line ID, speaker/listener references, multilingual text, menu text, branching links, optional Lua conditions and scripts, sequence commands, statuses, verification, VO context, and tags.

Dialogue flow and line content remain separate. Numeric Pixel Crushers conversation and entry IDs are persisted and never regenerated after assignment.

## Human workflows

- Navigate project, level, scene, and conversation hierarchy.
- Restructure branching dialogue on a node canvas.
- Inspect and edit a node without leaving the graph.
- Play through choices with local condition values and path history.
- Search globally by text, Line ID, character, tag, status, and language coverage.
- Review every external change since the last approved snapshot, then approve to create the next snapshot.
- Edit and verify two languages side by side.
- Validate orphan nodes, dead ends, missing translations, unknown speakers, undeclared variables, stale drafts, and Base ID overlap.
- Export screenplay and voice packages with branch-aware context.

## Status rules

- Text: `Placeholder → Draft → Polished → Edited → Final`, plus `Rework`.
- Voice: `None → Placeholder → Recorded → Processed → Final`, plus `Rework`.
- Agents may not set text above `Polished`.
- MCP/CLI cannot alter Final text or links without explicit force.
- Editing any line whose voice status is at least Recorded sets voice status to Rework.

## Languages

Initial configured set: English, Greek, Italian, German, and Griko as its own language code. Each line has a spoken/base language; other languages can serve as subtitles or reference. All interfaces and exports use UTF-8 and full Unicode.

## Pixel Crushers export

- One-way export: Reed is authoritative and Unity data is generated.
- Export local DialogueDatabase JSON; no Pixel Crushers server or Arcweave API.
- Preserve stable numeric IDs and Line IDs.
- Support single database and stable Base ID ranges split by level/scene.
- Validate cross-database links and range collisions before export.
- Keep localized field naming configurable until verified against a real Unity round trip.
- Stamp exports `GENERATED — DO NOT HAND-EDIT` with a schema/version marker.

## Build order

1. Core + SQLite WAL + permanent IDs + validation + history/backups + migrations.
2. Conversation graph schema and `get_schema`.
3. CLI-proven vertical slice.
4. Pixel Crushers export with golden-file Unity round-trip tests, split databases, and Base IDs.
5. Local MCP server and guardrails.
6. Editor graph, characters, hierarchy navigator, and beat map.
7. Play mode, filtering, search, and usage view.
8. Validation, variable registry, review inbox, and bulk editing.
9. Dual-language UI, translation table, verification, and external-change reload.
10. Screenplay, VO budget, and actor/studio packages.
