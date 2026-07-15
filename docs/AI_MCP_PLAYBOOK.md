# AI playbook for Reed MCP

This document is written for an AI agent. Follow it whenever Reed MCP is available.

## Your role

You are collaborating on branching dialogue stored in a local Reed project. Reed is the data authority. Use Reed MCP tools; never edit `.reed/reed.sqlite`, WAL files, backups, generated project JSON, or Pixel Crushers JSON directly.

The user is the final editorial authority. Your content is a draft until a human reviews it.

## Mandatory session startup

Before any mutation:

1. Call `get_schema` and check `schemaVersion` and allowed status vocabulary.
2. Call `list_projects`; state the connected project name and root.
3. Call `list_scenes`, `list_conversations`, and `list_characters` as relevant.
4. Call `get_validation_report` to establish the baseline.
5. Before changing an existing conversation, call `get_conversation` and retain its current `version`.

Do not assume a scene, character, conversation, language, Line ID, node UUID, or version from a previous session.

## Safe write loop

For every existing-conversation change:

1. Read the latest conversation.
2. Plan the smallest coherent mutation or batch.
3. Pass the conversation's current `version` as `expectedVersion`.
4. Use IDs returned by Reed; do not invent UUIDs, Line IDs, or numeric IDs.
5. Read the conversation again after structural changes.
6. Run `get_validation_report` after the batch.
7. Report exactly what changed, the permanent Line IDs created/edited, and all remaining validation errors or warnings.

If Reed returns `STALE_VERSION`, stop that write sequence. Read the conversation again, inspect the returned intervening changes, revise the plan if necessary, and retry with the new version. Never solve concurrency by dropping `expectedVersion`.

## Human and agent authority

- New agent-authored lines default to Draft.
- You may set text status only through Polished.
- Edited and Final are human-only.
- You cannot rewrite Final text, even with `force`.
- You cannot finalize recorded voice.
- Treat destructive actions as exceptional. `delete_node` requires `confirmation` to exactly equal its permanent Line ID.
- Do not unlink or restructure Final flow without asking the human to reopen it in the editor.

If a guardrail blocks you, explain the human action required. Do not seek a technical bypass.

## Language rules

- Use only language codes returned by `get_schema`/the project record.
- English is `en`, Greek is `el`, Italian is `it`, German is `de`, and Griko is `griko` unless the project says otherwise.
- Griko is distinct from Italian.
- `spokenLanguage` is per line. Do not infer it from the display/reference language.
- Preserve text in languages the user did not ask you to change.
- Use `set_line_text` or `update_node_text` one language at a time.
- Use `menuText` for the player-facing choice label when it should differ from the spoken/full text.
- Never mark `native-verified` unless a human/native-speaker workflow explicitly authorizes it.

## Preferred tools

### Read and orient

- `list_projects`
- `list_scenes`
- `list_conversations`
- `get_conversation`
- `find_lines`
- `get_validation_report`
- `get_schema`
- `list_characters`

### Build structure

- `create_scene`
- `create_conversation`
- `add_dialogue_node`
- `link_nodes`
- `unlink_nodes`
- `delete_node`

### Edit content and production metadata

- `set_line_text` / `update_node_text`
- `set_node_menu_text`
- `update_node`
- `set_node_conditions`
- `set_node_sequence`
- `add_tags`
- `set_line_status`
- `upsert_character`

### Batch and handoff

- Prefer `import_conversation_json` when creating a complete new conversation graph. Reed will allocate permanent IDs and auto-layout it.
- Use `export_pixelcrushers` only after validation is acceptable.
- Use `export_voice` for local PDF/CSV/XLSX production handoff.

## Bulk conversation pattern

First obtain a real `sceneId` from `list_scenes` and character UUIDs from `list_characters`. Then call `import_conversation_json` with a shape like:

```json
{
  "sceneId": "REAL-SCENE-UUID",
  "title": "At the harbour gate",
  "description": "A guarded first meeting with a branch and bottleneck.",
  "nodes": [
    {
      "key": "greeting",
      "kind": "line",
      "speakerCharacterId": "REAL-CHARACTER-UUID",
      "spokenLanguage": "el",
      "texts": {
        "el": "Η θάλασσα σε γύρισε πίσω.",
        "en": "The sea brought you back."
      },
      "menuTexts": {},
      "sequence": "",
      "conditions": "",
      "userScript": "",
      "tags": ["arrival", "harbour"],
      "isTerminal": false
    },
    {
      "key": "ask_name",
      "kind": "choice",
      "spokenLanguage": "en",
      "texts": {
        "en": "Do you remember me?",
        "it": "Ti ricordi di me?"
      },
      "menuTexts": {
        "en": "Ask if she remembers",
        "it": "Chiedi se si ricorda"
      },
      "sequence": "",
      "conditions": "",
      "userScript": "",
      "tags": ["memory"],
      "isTerminal": true
    }
  ],
  "links": [
    {
      "originKey": "greeting",
      "destinationKey": "ask_name",
      "priority": 0
    }
  ]
}
```

The `key` values are temporary within this request. Reed returns the real node UUIDs and permanent Line IDs. Never reuse temporary keys as Line IDs.

If a branch needs a condition such as `Variable['MetEleni'] == true`, confirm that the variable already exists. Reed MCP 0.1 does not expose variable-list or variable-declaration tools; ask the human to confirm/create it in the editor or CLI before you write the condition. Never invent a variable and leave validation broken.

## Dialogue quality expectations

- Ask for the intended branching architecture if it materially changes the result: linear-with-branches, branch-and-bottleneck, hub-and-spoke, parallel tracks, or a custom node graph.
- Keep choices meaningfully distinct, not paraphrases of the same intent.
- Use group nodes for logic junctions without spoken text.
- Use conditions consistently. Because this MCP version cannot read or declare the variable registry, ask the human to confirm/create each new variable in the editor or CLI, then check the validation report.
- Mark genuine path endings `isTerminal: true` so they are not reported as accidental dead ends.
- Add `contextComment`, `voiceComment`, and tags when they materially help review or recording.
- Preserve the user's register, character voice, and language constraints. Do not silently normalize Greek, Griko, dialect, jokes, or profanity.

## Validation and completion

Do not call a task complete until you have called `get_validation_report` after the final write.

In your final response, give the human:

1. project and conversation changed;
2. branching structure created or altered;
3. permanent Line IDs created/edited/deleted;
4. languages and spoken-language assignments touched;
5. latest conversation version if available;
6. validation error/warning counts and unresolved issues;
7. whether any Pixel Crushers or voice export was produced and its local path.

Never claim Unity compatibility certification from a successful JSON export alone. A project-specific Pixel Crushers/Unity fixture round trip remains a human release check.

## Compact instruction block

The following can be pasted into an agent's system/project instructions:

```text
When Reed MCP is available, call get_schema, list_projects, and get_validation_report before writing. Read each existing conversation immediately before editing and pass its current version as expectedVersion. Use only Reed-returned UUIDs and permanent Line IDs. Prefer import_conversation_json for a complete new graph. Agent content defaults to Draft and may advance only through Polished; never bypass Final-content or destructive-action guardrails. Preserve unrequested languages, treat Griko separately from Italian, and set spokenLanguage explicitly per line when known. After every batch, re-read the conversation, run validation, and report permanent Line IDs plus all unresolved issues. Never edit SQLite or generated exports directly.
```
