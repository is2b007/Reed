#!/usr/bin/env node
import process from "node:process";
import path from "node:path";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  AddNodeInputSchema,
  CreateConversationInputSchema,
  CreateSceneInputSchema,
  DeclareVariableInputSchema,
  DeleteNodeInputSchema,
  ImportConversationInputSchema,
  LinkNodesInputSchema,
  SetLineStatusInputSchema,
  SetNodeTextInputSchema,
  UnlinkNodesInputSchema,
  UpdateConversationInputSchema,
  UpdateNodeInputSchema,
  UpdateProjectInputFields,
  UpdateSceneInputSchema,
  UpsertCharacterInputSchema,
} from "@reed/schema";
import {
  ReedError,
  ReedProject,
  exportGameData,
  exportPixelCrushers,
  exportVoicePackage,
  getSchemaDescriptor,
  validateProject,
} from "@reed/core";

function projectArgument(): string {
  const index = process.argv.indexOf("--project");
  return path.resolve(index >= 0 ? process.argv[index + 1] ?? "" : process.env.REED_PROJECT ?? process.cwd());
}

function response(value: unknown): CallToolResult {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

function errorResponse(error: unknown): CallToolResult {
  const value = error instanceof ReedError
    ? { code: error.code, message: error.message, details: error.details }
    : { code: "UNEXPECTED", message: error instanceof Error ? error.message : String(error), details: {} };
  return { isError: true, content: [{ type: "text" as const, text: JSON.stringify({ ok: false, error: value }, null, 2) }] };
}

const project = await ReedProject.open(projectArgument());

/** Agents may only write exports inside the open project; relative paths resolve under its exports folder. */
function projectOutputDirectory(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const target = path.resolve(project.paths.exports, value);
  const relative = path.relative(project.paths.root, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new ReedError("Agent exports must stay inside the open Reed project", "OUTPUT_OUTSIDE_PROJECT", { outputDirectory: value, root: project.paths.root });
  }
  return target;
}
const server = new McpServer({ name: "reed", version: "0.2.3" });

function register<T extends z.AnyZodObject>(name: string, description: string, schema: T, handler: (args: z.infer<T>) => unknown | Promise<unknown>): void {
  server.tool(name, description, schema.shape, async (args: z.infer<T>) => {
    try { return response({ ok: true, data: await handler(args as z.infer<T>) }); }
    catch (error) { return errorResponse(error); }
  });
}

register("list_projects", "Return the local Reed project opened by this stdio server.", z.object({}), () => [{ ...project.getProject(), root: project.paths.root }]);
register("list_scenes", "List project scenes and their frozen Line ID prefixes.", z.object({}), () => project.listScenes());
register("list_conversations", "List conversations, optionally within one scene.", z.object({ sceneId: z.string().uuid().optional() }), ({ sceneId }) => project.listConversations().filter((conversation) => !sceneId || conversation.sceneId === sceneId));
register("get_conversation", "Read a complete versioned conversation graph.", z.object({ conversationId: z.string().uuid() }), ({ conversationId }) => project.getConversation(conversationId));
register("find_lines", "Search local dialogue text and filter by character, tag, status, or language coverage.", z.object({
  query: z.string().optional(), characterId: z.string().uuid().optional(), tag: z.string().optional(), status: z.string().optional(),
  language: z.string().optional(), missingLanguage: z.string().optional(), limit: z.number().int().positive().max(500).optional(),
}), (args) => project.findLines(args));
register("get_validation_report", "Validate graph structure, localization, variables, cast, and database ID ranges.", z.object({}), () => validateProject(project));
register("get_schema", "Return Reed's schema version and allowed production vocabulary.", z.object({}), () => getSchemaDescriptor());
register("list_characters", "List the cast registry.", z.object({}), () => project.listCharacters());
register("list_variables", "List declared Pixel Crushers condition variables and their initial values.", z.object({}), () => project.listVariables());

register("update_project", "Update versioned project identity, languages, or offline pull-request handoff settings without changing permanent content IDs.", z.object(UpdateProjectInputFields), (args) => project.updateProject({ ...args, source: "agent" }));
register("create_scene", "Create a scene. Agent-created data is recorded as agent-sourced.", CreateSceneInputSchema, (args) => project.createScene({ ...args, source: "agent" }));
register("update_scene", "Update a scene name, local beat reference, or display order without changing its permanent Line ID prefix.", UpdateSceneInputSchema, (args) => project.updateScene({ ...args, source: "agent" }));
register("create_conversation", "Create a conversation with a permanent numeric ID and START node.", CreateConversationInputSchema, (args) => project.createConversation({ ...args, source: "agent" }));
register("update_conversation", "Update a conversation title or description through its versioned local record.", UpdateConversationInputSchema, (args) => project.updateConversation({ ...args, source: "agent" }));
register("add_dialogue_node", "Add a Draft line, choice, or group node.", AddNodeInputSchema, (args) => project.addNode({ ...args, source: "agent" }));
register("link_nodes", "Create a graph edge, including cross-conversation edges.", LinkNodesInputSchema, (args) => project.linkNodes({ ...args, source: "agent" }));
register("unlink_nodes", "Remove a graph edge. Final content remains human-protected.", UnlinkNodesInputSchema, (args) => project.unlinkNodes({ ...args, source: "agent" }));
register("delete_node", "Delete a node only when confirmation exactly matches its Line ID.", DeleteNodeInputSchema, (args) => project.deleteNode({ ...args, source: "agent" }));
register("update_node_text", "Set dialogue text and optional menu text for one language.", SetNodeTextInputSchema, (args) => project.setNodeText({ ...args, source: "agent" }));
register("set_line_text", "Set one language value by permanent Line ID.", SetNodeTextInputSchema, (args) => project.setNodeText({ ...args, source: "agent" }));
register("set_node_menu_text", "Set only the menu label while preserving dialogue text.", z.object({
  lineId: z.string(), language: z.string(), menuText: z.string(), expectedVersion: z.number().int().positive().optional(), force: z.boolean().default(false),
}), ({ lineId, language, menuText, expectedVersion, force }) => {
  const node = project.getNodeByLineId(lineId);
  const text = node.texts.find((value) => value.language === language)?.text ?? "";
  return project.setNodeText({ lineId, language, text, menuText, expectedVersion, force, source: "agent" });
});
register("update_node", "Update conditions, sequence, script, speaker, context, tags, terminal state, or layout.", UpdateNodeInputSchema, (args) => project.updateNode({ ...args, source: "agent" }));
register("set_node_conditions", "Set a node's Pixel Crushers Lua condition.", z.object({ lineId: z.string(), conditions: z.string(), expectedVersion: z.number().int().positive().optional(), force: z.boolean().default(false) }), (args) => project.updateNode({ ...args, source: "agent" }));
register("set_node_sequence", "Set a node's Pixel Crushers sequence commands.", z.object({ lineId: z.string(), sequence: z.string(), expectedVersion: z.number().int().positive().optional(), force: z.boolean().default(false) }), (args) => project.updateNode({ ...args, source: "agent" }));
register("add_tags", "Replace a node's searchable production tags.", z.object({ lineId: z.string(), tags: z.array(z.string()), expectedVersion: z.number().int().positive().optional(), force: z.boolean().default(false) }), (args) => project.updateNode({ ...args, source: "agent" }));
register("set_line_status", "Set an agent-authored line up to Polished. Edited and Final are human-only.", SetLineStatusInputSchema, (args) => project.setLineStatus({ ...args, source: "agent" }));
register("upsert_character", "Create or update a cast entry with a persistent actor ID.", UpsertCharacterInputSchema, (args) => project.upsertCharacter({ ...args, source: "agent" }));
register("declare_variable", "Create or update a typed condition variable with a persistent numeric ID.", DeclareVariableInputSchema, (args) => project.declareVariable({ ...args, source: "agent" }));
register("import_conversation_json", "Bulk-create and deterministically auto-layout a complete conversation graph.", ImportConversationInputSchema, (args) => project.importConversation({ ...args, source: "agent" }));
register("export_pixelcrushers", "Validate and export local Pixel Crushers DialogueDatabase JSON.", z.object({
  mode: z.enum(["single", "partitioned"]).default("single"), outputDirectory: z.string().optional().describe("Inside the project; relative paths resolve under exports/"), allowInvalid: z.boolean().default(false),
}), (args) => exportPixelCrushers(project, { ...args, outputDirectory: projectOutputDirectory(args.outputDirectory) }));
register("export_game_data", "Export local engine and localization interchange files using permanent Reed Line IDs.", z.object({
  format: z.enum(["json", "csv", "unity-localization", "godot", "unreal-string-table", "yarn-spinner", "gettext", "xliff-2.0"]),
  outputDirectory: z.string().optional(),
  languages: z.array(z.string()).optional(),
}), (args) => exportGameData(project, { ...args, outputDirectory: projectOutputDirectory(args.outputDirectory) }));
register("export_voice", "Export local voice-actor PDF and studio CSV/XLSX files.", z.object({
  outputDirectory: z.string().optional(), language: z.string().optional(), characterIds: z.array(z.string().uuid()).optional(), voiceStatuses: z.array(z.string()).optional(), lineStatuses: z.array(z.string()).optional(),
}), (args) => exportVoicePackage(project, { ...args, outputDirectory: projectOutputDirectory(args.outputDirectory) }));

server.registerResource("project-schema", "reed://schema", { title: "Reed schema", mimeType: "application/json" }, async (uri) => ({
  contents: [{ uri: uri.href, mimeType: "application/json", text: JSON.stringify(getSchemaDescriptor(), null, 2) }],
}));

const shutdown = async () => {
  project.close();
  await server.close();
};
process.once("SIGINT", () => { void shutdown(); });
process.once("SIGTERM", () => { void shutdown(); });

await server.connect(new StdioServerTransport());
