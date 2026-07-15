# Reed MCP server

For installation and client configuration, start with [Set up Reed MCP](MCP_SETUP.md). For agent behavior, use [AI playbook for Reed MCP](AI_MCP_PLAYBOOK.md).

The MCP server is a local stdio adapter over `@reed/core`. It opens exactly one project passed by `--project` or `REED_PROJECT`, does not listen on a port, never invokes an LLM, and returns JSON text envelopes with `{ok,data}` or structured `{ok:false,error:{code,message,details}}` values.

Start the compiled server:

```sh
node /absolute/path/to/Reed/apps/mcp/dist/index.js --project /absolute/path/to/project
```

## Read tools

`list_projects`, `list_scenes`, `list_conversations`, `get_conversation`, `find_lines`, `get_validation_report`, `get_schema`, and `list_characters`.

The `reed://schema` resource exposes the same schema descriptor for clients that prefer MCP resources.

## Mutation tools

- Structure: `create_scene`, `create_conversation`, `add_dialogue_node`, `link_nodes`, `unlink_nodes`, `delete_node`.
- Content: `update_node_text`, `set_line_text`, `set_node_menu_text`, `update_node`, `set_node_conditions`, `set_node_sequence`, `add_tags`, `set_line_status`.
- Cast: `upsert_character`.
- Bulk: `import_conversation_json`, including deterministic breadth-first auto-layout.
- Handoff: `export_pixelcrushers`, `export_voice`.

Writes are recorded with source `agent`. Inputs accept `expectedVersion` where applicable. Stale versions return a structured conflict and change list. Agent-created lines default to Draft; an agent cannot set Edited/Final, finalize voice, or modify Final text even by passing force. Destructive deletion requires an exact Line-ID confirmation.

The server intentionally contains no prompt, provider key, model selection, HTTP transport, or generation UI. Those belong to the external agent process.
