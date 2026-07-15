# Reed CLI reference

Run the workspace source command with `CI=true pnpm reed`, or run the built `packages/cli/dist/index.js` directly. Global options are `--project <folder>`, `--json`, and `--source human|agent|system`. `reed dialogue …` and `reed …` are equivalent.

## Project and structure

| Command | Purpose |
|---|---|
| `init [folder]` | Create a project and canonical database. |
| `add-level <name>` | Add an optional level. |
| `add-scene <name>` | Add a scene and freeze its Line-ID prefix. |
| `add-partition <name>` | Reserve a non-overlapping Pixel Crushers Base ID range. |
| `add-conversation <title>` | Create a conversation and START entry. |
| `import-conversation [file]` | Import stdin/file JSON and deterministically lay out the graph. |

## Dialogue

| Command | Purpose |
|---|---|
| `add-node <conversation-id>` | Add a line, choice, or group. |
| `link <origin-node-id> <destination-node-id>` | Create a local or cross-conversation edge. |
| `unlink <link-id>` | Remove an edge with Final-content protection. |
| `update-node <line-id>` | Set speaker, Lua, sequence, script, tags, context, terminal state, or position. |
| `delete-node <line-id> --confirm <line-id>` | Permanently delete after exact confirmation. |
| `set-text <line-id> <language> <text>` | Set dialogue and optional menu text. |
| `set-status <line-id> <status>` | Change text production state. |
| `set-voice-status <line-id> <status>` | Change voice production state. |

Mutation commands accept `--expected-version` where relevant. Final content requires `--force`; agent-sourced calls still cannot set Edited/Final or rewrite Final text.

## Registries, reads, and review

`upsert-character`, `declare-variable`, `list-scenes`, `list-characters`, `list-partitions`, `list-conversations`, `get-conversation`, `changes`, `find`, `validate`, `schema`, `review-diff`, and `approve-review` expose the shared core without raw SQL.

`validate` is the CI gate: it exits nonzero when errors block export. `find` supports local full-text search and status, character, tag, language, and missing-language filters.

## Safety and exports

| Command | Output |
|---|---|
| `backup [label]` | Named SQLite snapshot. |
| `restore <backup-id> --confirm <backup-id>` | Integrity-check and atomically restore a snapshot. |
| `export-project` | Deterministic Reed JSON. |
| `export-pixelcrushers` | Single or partitioned Unity JSON plus audio manifest. |
| `export-voice` | Actor PDF and studio CSV/XLSX. |
| `voice-budget` | Per-character lines, words, and estimated minutes. |
| `export-screenplay` | Golden-path Markdown in one or two languages. |

Use `--help` on any command for its exact flags and defaults.
