# Reed MCP server

For installation and client configuration, start with [Set up Reed MCP](MCP_SETUP.md). For agent behavior, use [AI playbook for Reed MCP](AI_MCP_PLAYBOOK.md). To edit a project held by Reed Android from Claude Android, use [Remote MCP from Claude Android](REMOTE_MCP_ANDROID.md).

The MCP server is a local stdio adapter over `@reed/core`. It opens exactly one project passed by `--project` or `REED_PROJECT`, does not listen on a port, never invokes an LLM, and returns JSON text envelopes with `{ok,data}` or structured `{ok:false,error:{code,message,details}}` values.

Start the compiled server:

```sh
node /absolute/path/to/Reed/apps/mcp/dist/index.js --project /absolute/path/to/project
```

## Read tools

`list_projects`, `list_scenes`, `list_conversations`, `get_conversation`, `find_lines`, `get_validation_report`, `get_schema`, `list_characters`, and `list_variables`.

The `reed://schema` resource exposes the same schema descriptor for clients that prefer MCP resources.

## Mutation tools

- Project: `update_project` for the versioned name, slug, language list, default language, `pullRequestProvider` (`disabled` or `github`), and `pullRequestBaseBranch`.
- Structure: `create_scene`, `create_conversation`, `add_dialogue_node`, `link_nodes`, `unlink_nodes`, `delete_node`.
- Content: `update_node_text`, `set_line_text`, `set_node_menu_text`, `update_node`, `set_node_conditions`, `set_node_sequence`, `add_tags`, `set_line_status`.
- Registries: `upsert_character`, `declare_variable`.
- Bulk: `import_conversation_json`, including deterministic breadth-first auto-layout.
- Handoff: `export_pixelcrushers`, `export_voice`. Voice export accepts `language`, `characterIds`, `voiceStatuses`, and `lineStatuses`, and writes a studio master PDF, individual actor PDFs, an XLSX session tracker, and CSV interchange data.

Writes are recorded with source `agent`. Inputs accept `expectedVersion` where applicable. Stale versions return a structured conflict and change list. Agent-created lines default to Draft; an agent cannot set Edited/Final, finalize voice, or modify Final text even by passing force. Destructive deletion requires an exact Line-ID confirmation.

The server intentionally contains no prompt, provider key, model selection, HTTP transport, or generation UI. Those belong to the external agent process.

For voice work, agents can store pronunciation in `update_node.pronunciation`, story circumstances in `contextComment`, and playable intention in `voiceComment`. Keep those concerns separate so an actor packet remains scannable. Export fails when a selected line lacks exact text in the requested language; see [Voice production handoff](VOICE_PRODUCTION.md).

Git branches and remote GitHub actions intentionally remain editor-owned workflows rather than MCP mutations. An agent can update the project’s PR preference, but the local stdio MCP server never gets a hidden route to authenticate, fetch, push, review, or merge. A human must start every remote action from Reed's History workspace.
