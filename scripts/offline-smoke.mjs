import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repository = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const guard = path.join(repository, "scripts", "offline-guard.mjs");
const projectRoot = await mkdtemp(path.join(os.tmpdir(), "reed-offline-"));
const inheritedEnvironment = Object.fromEntries(Object.entries(process.env).filter((entry) => typeof entry[1] === "string"));
const offlineEnvironment = { ...inheritedEnvironment, NODE_OPTIONS: `${process.env.NODE_OPTIONS ?? ""} --import=${guard}`.trim() };

function run(entrypoint, args = []) {
  const result = spawnSync(process.execPath, [entrypoint, ...args], { cwd: repository, env: offlineEnvironment, encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${path.basename(entrypoint)} failed offline (${result.status})\n${result.stdout}\n${result.stderr}`);
  return result.stdout;
}

async function sourceFiles(root) {
  const values = [];
  for (const item of await readdir(root, { withFileTypes: true })) {
    const fullPath = path.join(root, item.name);
    if (item.isDirectory()) values.push(...await sourceFiles(fullPath));
    else if (/\.(?:ts|tsx|css|html)$/u.test(item.name)) values.push(fullPath);
  }
  return values;
}

try {
  run(path.join(repository, "scripts", "create-demo.mjs"), [projectRoot]);
  const cli = path.join(repository, "packages", "cli", "dist", "index.js");
  const cliScenes = JSON.parse(run(cli, ["--project", projectRoot, "--json", "list-scenes"])).data;
  run(cli, ["--project", projectRoot, "--json", "update-scene", cliScenes[0].id, "--beat-ref", "CLI/Offline beat"]);
  const cliConversations = JSON.parse(run(cli, ["--project", projectRoot, "--json", "list-conversations"])).data;
  run(cli, ["--project", projectRoot, "--json", "update-conversation", cliConversations[0].id, "--description", "Updated offline through the CLI"]);
  run(cli, ["--project", projectRoot, "--json", "validate"]);
  run(cli, ["--project", projectRoot, "--json", "backup", "Offline smoke"]);
  run(cli, ["--project", projectRoot, "--json", "export-project"]);
  run(cli, ["--project", projectRoot, "--json", "export-pixelcrushers"]);
  run(cli, ["--project", projectRoot, "--json", "export-voice", "--language", "el"]);
  run(cli, ["--project", projectRoot, "--json", "export-screenplay", "--language", "el", "--reference-language", "en"]);

  const client = new Client({ name: "reed-offline-smoke", version: "0.1.0" }, { capabilities: {} });
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [path.join(repository, "apps", "mcp", "dist", "index.js"), "--project", projectRoot],
    env: offlineEnvironment,
    stderr: "pipe",
  });
  await client.connect(transport);
  const tools = await client.listTools();
  const requiredTools = ["import_conversation_json", "export_pixelcrushers", "update_scene", "update_conversation"];
  if (requiredTools.some((name) => !tools.tools.some((tool) => tool.name === name))) throw new Error("MCP tool surface is incomplete");
  const mcpScenes = await client.callTool({ name: "list_scenes", arguments: {} });
  const mcpScenePayload = JSON.parse(mcpScenes.content.find((item) => item.type === "text")?.text ?? "{}");
  const mcpScene = mcpScenePayload.data?.[0];
  if (!mcpScene || (await client.callTool({ name: "update_scene", arguments: { id: mcpScene.id, beatRef: "MCP/Offline beat" } })).isError) throw new Error("MCP scene metadata update failed offline");
  const mcpConversations = await client.callTool({ name: "list_conversations", arguments: {} });
  const mcpConversationPayload = JSON.parse(mcpConversations.content.find((item) => item.type === "text")?.text ?? "{}");
  const mcpConversation = mcpConversationPayload.data?.[0];
  if (!mcpConversation || (await client.callTool({ name: "update_conversation", arguments: { id: mcpConversation.id, description: "Updated offline through MCP", expectedVersion: mcpConversation.version } })).isError) throw new Error("MCP conversation metadata update failed offline");
  const validation = await client.callTool({ name: "get_validation_report", arguments: {} });
  if (validation.isError) throw new Error("MCP validation failed offline");
  await client.close();

  const projectJson = await readFile(path.join(projectRoot, "exports", "reed-project.json"), "utf8");
  if (!projectJson.includes("The Salt Gate")) throw new Error("Deterministic project export is missing");
  const voicePdf = await readFile(path.join(projectRoot, "exports", "voice", "voice-actor-handoff.pdf"));
  if (voicePdf.subarray(0, 4).toString() !== "%PDF") throw new Error("Voice PDF was not produced offline");

  const forbidden = /\bfetch\s*\(|new\s+WebSocket\b|EventSource\b|sendBeacon\b|electron-updater|autoUpdater|@sentry|posthog|amplitude|url\(\s*["']?https?:|<(?:script|link|img)[^>]+(?:src|href)=["']https?:/iu;
  for (const area of [path.join(repository, "apps"), path.join(repository, "packages")]) {
    for (const file of await sourceFiles(area)) {
      const text = await readFile(file, "utf8");
      if (forbidden.test(text)) throw new Error(`Forbidden runtime networking or remote asset reference in ${path.relative(repository, file)}`);
    }
  }
  const editorMain = await readFile(path.join(repository, "apps", "editor", "src", "main.ts"), "utf8");
  for (const protocol of ["http://*/*", "https://*/*", "ws://*/*", "wss://*/*"]) {
    if (!editorMain.includes(protocol)) throw new Error(`Editor offline boundary does not cover ${protocol}`);
  }
  process.stdout.write("Offline smoke passed: core, CLI, MCP, backups, Unicode exports, and editor network boundary.\n");
} finally {
  await rm(projectRoot, { recursive: true, force: true });
}
