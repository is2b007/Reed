# Set up Reed MCP

This guide is for the person installing Reed. The companion [AI MCP playbook](AI_MCP_PLAYBOOK.md) is written for the agent that will use it.

Reed MCP is a local stdio process. Your AI client starts it, sends MCP messages through standard input/output, and stops it when the client closes. Reed MCP does not open a port, contact an LLM, or make network requests. It opens one existing Reed project per server process.

This local setup is for desktop clients. For Claude Android editing a project stored on the same tablet, follow [Remote MCP from Claude Android](REMOTE_MCP_ANDROID.md). That separate, explicitly enabled mode uses a time-limited public relay because Android apps cannot start each other's local stdio processes.

## 1. Build the local MCP server

Open Terminal and run:

```sh
cd /Users/kostacanatselis/Documents/Reed
CI=true pnpm install
CI=true pnpm build:runtime
```

`pnpm install` is the development step that may need internet access. The built server and project work offline afterward.

Confirm these files exist:

```sh
test -f /Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js
test -f /Users/kostacanatselis/Documents/Reed/packages/core/dist/index.js
```

No output means both files exist.

## 2. Create or choose a Reed story project

The MCP `--project` value must point to a story project, not to the Reed source-code repository. A valid project contains `.reed/reed.sqlite`.

You can create one in the desktop app, or with the CLI:

```sh
cd /Users/kostacanatselis/Documents/Reed
CI=true pnpm reed init "$HOME/Documents/Reed Projects/My Story" \
  --name "My Story" \
  --slug my-story \
  --languages en,el,it,de,griko \
  --default-language en
```

Check it:

```sh
test -f "$HOME/Documents/Reed Projects/My Story/.reed/reed.sqlite" && echo "Reed project ready"
```

The editor, CLI, and MCP server may open the same project simultaneously. SQLite WAL and Reed's version checks coordinate their writes.

## 3. Add Reed to your AI client's MCP configuration

Choose a **local stdio MCP server** in your client. Use absolute paths because desktop applications may not inherit your Terminal `PATH`.

### Codex and the ChatGPT desktop app

Codex, the ChatGPT desktop app, and the Codex IDE extension share MCP configuration on the same Mac. The easiest route in the desktop app is:

1. open **Settings → MCP servers**;
2. select **Add server**;
3. name it `reed` and choose **STDIO**;
4. enter this command, changing only the final story-project path;
5. save, then select **Restart**.

```sh
/Users/kostacanatselis/.local/bin/node \
  /Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js \
  --project "/Users/kostacanatselis/Documents/Reed Projects/My Story"
```

You can also add it from a working Codex CLI:

```sh
codex mcp add reed -- \
  /Users/kostacanatselis/.local/bin/node \
  /Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js \
  --project "/Users/kostacanatselis/Documents/Reed Projects/My Story"
```

Confirm it with `codex mcp list`, or type `/mcp` inside Codex. If the CLI command itself is unavailable, use the desktop settings above or the TOML form below.

For explicit configuration, add this to `~/.codex/config.toml`. A project-local `.codex/config.toml` also works for a trusted project.

```toml
[mcp_servers.reed]
command = "/Users/kostacanatselis/.local/bin/node"
args = [
  "/Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js",
  "--project",
  "/Users/kostacanatselis/Documents/Reed Projects/My Story",
]
```

This is a local stdio server: it needs no URL, port, login, token, or OAuth. The guide remains complete offline; the optional [official Codex MCP reference](https://developers.openai.com/codex/mcp) describes the client settings in more detail.

### Clients that use JSON

Configuration for this Mac:

```json
{
  "mcpServers": {
    "reed": {
      "command": "/Users/kostacanatselis/.local/bin/node",
      "args": [
        "/Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js",
        "--project",
        "/Users/kostacanatselis/Documents/Reed Projects/My Story"
      ]
    }
  }
}
```

Replace only the final story-project path if yours is elsewhere. Some clients use a different outer setting name, but the server definition is always the same:

- transport: `stdio`;
- command: an absolute path to Node;
- first argument: the absolute `apps/mcp/dist/index.js` path;
- remaining arguments: `--project` and an absolute Reed story-project path.

Portable template:

```json
{
  "mcpServers": {
    "reed": {
      "command": "/ABSOLUTE/PATH/TO/node",
      "args": [
        "/ABSOLUTE/PATH/TO/Reed/apps/mcp/dist/index.js",
        "--project",
        "/ABSOLUTE/PATH/TO/YOUR/STORY"
      ]
    }
  }
}
```

You can supply the project as an environment variable instead:

```json
{
  "mcpServers": {
    "reed": {
      "command": "/Users/kostacanatselis/.local/bin/node",
      "args": [
        "/Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js"
      ],
      "env": {
        "REED_PROJECT": "/Users/kostacanatselis/Documents/Reed Projects/My Story"
      }
    }
  }
}
```

The explicit `--project` form is easier to audit and is recommended. JSON clients do not all use the same outer setting name, so consult the client's local help if it does not recognize `mcpServers`.

## 4. Restart and verify the AI client

After saving the configuration, fully restart or reload your AI client so it starts the server again. Ask the agent:

> Use Reed MCP. Call `get_schema`, then `list_projects`, `list_scenes`, and `get_validation_report`. Do not change anything. Tell me the connected project root, schema version, languages, and current validation result.

A correct connection should expose these read tools:

- `get_schema`
- `list_projects`
- `list_scenes`
- `list_conversations`
- `get_conversation`
- `find_lines`
- `get_validation_report`
- `list_characters`
- `list_variables`

Project metadata and the condition registry can also be maintained through the versioned `update_project` and `declare_variable` tools. Agents should read `list_projects` or `list_variables` first and pass `expectedVersion` on writes where the schema supports it.

The server also exposes the `reed://schema` MCP resource.

## 5. Give the AI its Reed rules

Add [AI_MCP_PLAYBOOK.md](AI_MCP_PLAYBOOK.md) to the agent's project instructions, knowledge files, or initial prompt. The short version is:

> Read Reed's schema and current project state before writing. Use the returned conversation version as `expectedVersion`. Prefer `import_conversation_json` for a complete new graph. Never bypass Final content, invent IDs, write SQLite directly, or call network services from Reed. Validate after every batch and report the created Line IDs and remaining issues.

## Updating Reed

After pulling or changing MCP/core code, rebuild and restart the AI client:

```sh
cd /Users/kostacanatselis/Documents/Reed
CI=true pnpm build:runtime
```

Project data and backups are not inside `dist`, so rebuilding does not replace them.

## Switching projects

One MCP process opens one Reed project. To work on another story:

1. change the final `--project` path in the client configuration;
2. restart/reload the MCP server or AI client;
3. ask the agent to call `list_projects` and confirm the new root before writing.

You may configure multiple named Reed servers, each with a different project path, for example `reed_my_story` and `reed_prototype`.

## Troubleshooting

### The server exits immediately

The project path is usually wrong or does not contain `.reed/reed.sqlite`. Run:

```sh
ls -l "/absolute/story/path/.reed/reed.sqlite"
```

If the database does not exist, create/open the project in Reed first.

### `node` or the MCP file cannot be found

Use absolute paths. On this Mac, Node is:

```text
/Users/kostacanatselis/.local/bin/node
```

The built MCP entrypoint is:

```text
/Users/kostacanatselis/Documents/Reed/apps/mcp/dist/index.js
```

Re-run `CI=true pnpm build:runtime` if `dist/index.js` is missing.

### Running the server manually appears to hang

That is normal. A stdio MCP server waits silently for an MCP client. Press Control-C to stop it. Do not expect a web page or listening port.

### `STALE_VERSION`

Another editor, CLI, or agent changed the conversation after it was read. The error includes intervening changes. The agent should re-read `get_conversation`, reconsider its edit, and retry with the new version—not omit `expectedVersion`.

### Final-content guardrail error

Agents cannot rewrite Final text or promote text above Polished. Review and reopen/finalize content in the human editor. Force is not an agent bypass.

### MCP connects but the requested tool is absent

Rebuild the current source and restart the client:

```sh
cd /Users/kostacanatselis/Documents/Reed
CI=true pnpm build:runtime
```

### Full offline acceptance

Run:

```sh
cd /Users/kostacanatselis/Documents/Reed
CI=true pnpm test:offline
```

This blocks network APIs at the process level while exercising the built CLI, MCP server, backups, validation, and Unicode exports.

## Security boundary

- Reed MCP receives no model credentials and contains no LLM client.
- The external AI application owns any model/network connection.
- Reed MCP uses local stdio and local files only.
- All reads and writes go through `@reed/core`; agents never receive raw SQL access.
- Back up or version the story project folder independently of the Reed application bundle.
