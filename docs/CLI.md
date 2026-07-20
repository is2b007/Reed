# Reed CLI reference

Run the workspace source command with `CI=true pnpm reed`, or run the built `packages/cli/dist/index.js` directly. Global options are `--project <folder>`, `--json`, and `--source human|agent|system`. `reed dialogue …` and `reed …` are equivalent.

## Project and structure

| Command | Purpose |
|---|---|
| `init [folder]` | Create a project and canonical database. |
| `update-project` | Change project identity, languages, or `--pull-requests disabled|github` / `--pr-base` settings with version checks. |
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
| `update-node <line-id>` | Set speaker, Lua, sequence, script, tags, story context, pronunciation, terminal state, or position. |
| `delete-node <line-id> --confirm <line-id>` | Permanently delete after exact confirmation. |
| `set-text <line-id> <language> <text>` | Set dialogue and optional menu text. |
| `set-status <line-id> <status>` | Change text production state. |
| `set-voice-status <line-id> <status>` | Change voice production state. |

Mutation commands accept `--expected-version` where relevant. Final content requires `--force`; agent-sourced calls still cannot set Edited/Final or rewrite Final text.

## Registries, reads, and review

`upsert-character`, `declare-variable`, `list-scenes`, `list-characters`, `list-variables`, `list-partitions`, `list-conversations`, `get-conversation`, `changes`, `find`, `validate`, `schema`, `review-diff`, and `approve-review` expose the shared core without raw SQL.

`validate` is the CI gate: it exits nonzero when errors block export. `find` supports local full-text search and status, character, tag, language, and missing-language filters.

## Safety and exports

| Command | Output |
|---|---|
| `backup [label]` | Named SQLite snapshot. |
| `restore <backup-id> --confirm <backup-id>` | Integrity-check and atomically restore a snapshot. |
| `git-status` | Inspect local Git story history without contacting a remote. |
| `git-init` | Initialize a local repository and create the first deterministic story checkpoint. |
| `git-checkpoint <message>` | Export current story JSON and commit all project-owned files. |
| `git-branch <name>` | Start a local story branch from a clean checkpoint. |
| `git-pr-handoff --title <title>` | Validate the local branch and prepare inert `git`/`gh` publish, create, list, review, and merge commands. Use `--number` for an existing PR. |
| `git-set-remote <url>` | Store an origin URL locally; `--remove` removes it. This command never connects. |
| `export-project` | Deterministic Reed JSON. |
| `export-pixelcrushers` | Single or partitioned Unity JSON plus audio manifest. |
| `export-voice` | Studio master PDF, one PDF per actor, session XLSX, and CSV. Filter with `--language`, `--character`, `--status`, and `--line-status`. |
| `voice-budget` | Per-character lines, words, and estimated minutes. |
| `export-screenplay` | Golden-path Markdown in one or two languages. |
| `export-game-data --format <format>` | Local game-engine and localization interchange: JSON, CSV, Unity Localization, Godot, Unreal String Tables, Yarn Spinner, gettext PO, or XLIFF 2.0. Optional `--languages` limits output files/columns. |

Use `--help` on any command for its exact flags and defaults.

Voice export always requires real dialogue in the requested language; Reed does not silently substitute another language in an actor script. `--character` accepts comma-separated character UUIDs, while `--status` and `--line-status` accept comma-separated production states. See [Voice production handoff](VOICE_PRODUCTION.md).

Language settings accept canonical IETF BCP 47 tags such as `pt-BR`, `es-419`, `zh-Hans`, and private-use tags such as `x-griko`. See [Languages and game localization exports](LOCALIZATION_EXPORTS.md).

The CLI remains an offline automation surface: its GitHub handoff command only prepares inert commands and never authenticates, fetches, pushes, reviews, or merges. People can perform those optional remote actions without Terminal in the editor's **History** workspace after enabling GitHub collaboration for that project. See [Local history and optional GitHub collaboration](PROJECT_HISTORY.md).
