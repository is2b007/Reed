import { createHash } from "node:crypto";
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  canonicalizeLanguageCode,
  languageDisplayName,
  localeForGodot,
  localeForUnity,
  localeForUnreal,
} from "@reed/schema";
import { atomicWriteFile } from "./atomic-write.js";
import { ConflictError } from "./errors.js";
import type { CharacterRecord, DialogueNodeRecord } from "./models.js";
import type { ReedProject } from "./project.js";

export const GAME_EXPORT_FORMATS = [
  "json",
  "csv",
  "unity-localization",
  "godot",
  "unreal-string-table",
  "yarn-spinner",
  "gettext",
  "xliff-2.0",
] as const;

export type GameExportFormat = typeof GAME_EXPORT_FORMATS[number];

export interface GameExportOptions {
  format: GameExportFormat;
  outputDirectory?: string;
  /** Defaults to every enabled project language, in project order. */
  languages?: string[];
}

export interface GameExportResult {
  format: GameExportFormat;
  outputDirectory: string;
  filePaths: string[];
  languages: string[];
  entryCount: number;
}

interface LocalizationEntry {
  lineId: string;
  numericId: string;
  kind: "line" | "choice";
  speaker: string;
  listener: string;
  scene: string;
  sceneSlug: string;
  conversation: string;
  conversationNumericId: number;
  entryNumericId: number;
  context: string;
  developerComment: string;
  tags: string[];
  lineStatus: string;
  voiceStatus: string;
  spokenLanguage: string;
  text: Record<string, string>;
  menuText: Record<string, string>;
}

interface StringResource {
  key: string;
  lineId: string;
  field: "dialogue" | "menu";
  entry: LocalizationEntry;
  values: Record<string, string>;
}

function safeFilePart(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "") || "dialogue";
}

function csvCell(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function csvRow(values: Array<string | number>): string {
  return values.map(csvCell).join(",");
}

function xml(value: string): string {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}

function po(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll('"', '\\"').replaceAll("\t", "\\t").replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

function unreal(value: string): string {
  return value.replaceAll("\\", "\\\\").replaceAll("\t", "\\t").replaceAll("\r", "\\r").replaceAll("\n", "\\n");
}

function stableNumericId(value: string): string {
  // 63-bit FNV-1a: deterministic, positive, and accepted as a decimal CSV ID.
  let hash = 0xcbf29ce484222325n;
  for (const byte of new TextEncoder().encode(value)) {
    hash ^= BigInt(byte);
    hash = BigInt.asUintN(64, hash * 0x100000001b3n);
  }
  const positive = hash & 0x7fffffffffffffffn;
  return (positive === 0n ? 1n : positive).toString();
}

function yarnLock(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex").slice(0, 8);
}

function enabledLanguages(reed: ReedProject, requested?: string[]): string[] {
  const project = reed.getProject();
  if (!requested?.length) return [...project.languages];
  const enabled = new Map(project.languages.map((code) => [canonicalizeLanguageCode(code).toLowerCase(), code]));
  const result: string[] = [];
  for (const requestedCode of requested) {
    const code = enabled.get(canonicalizeLanguageCode(requestedCode).toLowerCase());
    if (!code) throw new ConflictError("Export language is not enabled for this project", { language: requestedCode, languages: project.languages });
    if (!result.includes(code)) result.push(code);
  }
  return result;
}

function selectedText(node: DialogueNodeRecord, language: string, field: "text" | "menuText"): string {
  const value = node.texts.find((candidate) => candidate.language === language);
  return field === "text" ? value?.text ?? "" : value?.menuText ?? "";
}

function collectEntries(reed: ReedProject, languages: string[]): LocalizationEntry[] {
  const characters = new Map(reed.listCharacters().map((character) => [character.id, character]));
  const scenes = new Map(reed.listScenes().map((scene) => [scene.id, scene]));
  const entries: LocalizationEntry[] = [];
  const conversations = [...reed.listConversations()].sort((left, right) => {
    const leftScene = scenes.get(left.sceneId);
    const rightScene = scenes.get(right.sceneId);
    return (leftScene?.sortOrder ?? 0) - (rightScene?.sortOrder ?? 0)
      || left.numericId - right.numericId
      || left.id.localeCompare(right.id);
  });
  for (const conversation of conversations) {
    const scene = scenes.get(conversation.sceneId);
    const graph = reed.getConversation(conversation.id);
    for (const node of [...graph.nodes].sort((left, right) => left.entryNumericId - right.entryNumericId || left.id.localeCompare(right.id))) {
      if (node.kind !== "line" && node.kind !== "choice") continue;
      const characterName = (id: string | null): string => id ? characters.get(id)?.name ?? "Unknown" : "";
      entries.push({
        lineId: node.lineId,
        numericId: stableNumericId(node.lineId),
        kind: node.kind,
        speaker: characterName(node.speakerCharacterId),
        listener: characterName(node.listenerCharacterId),
        scene: scene?.name ?? "",
        sceneSlug: scene?.slug ?? "scene",
        conversation: conversation.title,
        conversationNumericId: conversation.numericId,
        entryNumericId: node.entryNumericId,
        context: node.contextComment,
        developerComment: node.voiceComment,
        tags: [...node.tags],
        lineStatus: node.lineStatus,
        voiceStatus: node.voiceStatus,
        spokenLanguage: node.spokenLanguage,
        text: Object.fromEntries(languages.map((language) => [language, selectedText(node, language, "text")])),
        menuText: Object.fromEntries(languages.map((language) => [language, selectedText(node, language, "menuText")])),
      });
    }
  }
  const numericIds = new Set<string>();
  for (const entry of entries) {
    if (numericIds.has(entry.numericId)) throw new ConflictError("A stable localization ID collision was detected", { lineId: entry.lineId, numericId: entry.numericId });
    numericIds.add(entry.numericId);
  }
  return entries;
}

function resources(entries: LocalizationEntry[]): StringResource[] {
  return entries.flatMap((entry) => {
    const result: StringResource[] = [{ key: entry.lineId, lineId: entry.lineId, field: "dialogue", entry, values: entry.text }];
    if (Object.values(entry.menuText).some(Boolean)) result.push({ key: `${entry.lineId}.menu`, lineId: entry.lineId, field: "menu", entry, values: entry.menuText });
    return result;
  });
}

const atomicWrite = atomicWriteFile;

function resourceComment(resource: StringResource): string {
  return [
    resource.field === "menu" ? "Choice menu text" : resource.entry.kind === "choice" ? "Choice dialogue" : "Dialogue",
    resource.entry.speaker ? `Speaker: ${resource.entry.speaker}` : "",
    resource.entry.context,
    resource.entry.developerComment,
  ].filter(Boolean).join(" · ");
}

async function exportJson(directory: string, slug: string, projectName: string, defaultLanguage: string, languages: string[], entries: LocalizationEntry[]): Promise<string[]> {
  const filePath = path.join(directory, `${slug}.localization.json`);
  const payload = {
    format: "reed-localization",
    formatVersion: 1,
    project: { name: projectName, slug, defaultLanguage, languages },
    entries: Object.fromEntries(entries.map((entry) => [entry.lineId, {
      type: entry.kind,
      speaker: entry.speaker || null,
      listener: entry.listener || null,
      scene: entry.scene,
      conversation: entry.conversation,
      context: entry.context,
      tags: entry.tags,
      spokenLanguage: entry.spokenLanguage,
      text: Object.fromEntries(languages.map((language) => [language, entry.text[language] ?? ""])),
      menuText: Object.fromEntries(languages.map((language) => [language, entry.menuText[language] ?? ""])),
    }])),
  };
  return [await atomicWrite(filePath, `${JSON.stringify(payload, null, 2)}\n`)];
}

async function exportCsv(directory: string, slug: string, languages: string[], entries: LocalizationEntry[]): Promise<string[]> {
  const rows = [csvRow(["Line ID", "Language", "Text", "Menu Text", "Type", "Speaker", "Listener", "Scene", "Conversation", "Context", "Tags", "Text Status", "Voice Status", "Spoken Language"])];
  for (const entry of entries) for (const language of languages) rows.push(csvRow([
    entry.lineId, language, entry.text[language] ?? "", entry.menuText[language] ?? "", entry.kind, entry.speaker, entry.listener,
    entry.scene, entry.conversation, entry.context, entry.tags.join(" | "), entry.lineStatus, entry.voiceStatus, entry.spokenLanguage,
  ]));
  return [await atomicWrite(path.join(directory, `${slug}.localization.csv`), `${rows.join("\n")}\n`)];
}

async function exportUnity(directory: string, slug: string, languages: string[], values: StringResource[]): Promise<string[]> {
  const headers = ["Key", "Id", "Shared Comments", ...languages.map((language) => `${languageDisplayName(language)}(${localeForUnity(language)})`)];
  const rows = [csvRow(headers)];
  for (const resource of values) rows.push(csvRow([
    resource.key, stableNumericId(resource.key), resourceComment(resource), ...languages.map((language) => resource.values[language] ?? ""),
  ]));
  return [await atomicWrite(path.join(directory, `${slug}.unity-localization.csv`), `${rows.join("\n")}\n`)];
}

async function exportGodot(directory: string, slug: string, languages: string[], values: StringResource[]): Promise<string[]> {
  const rows = [csvRow(["keys", ...languages.map(localeForGodot), "_speaker", "_context", "_reed_line_id", "_field"])];
  for (const resource of values) rows.push(csvRow([
    resource.key, ...languages.map((language) => resource.values[language] ?? ""), resource.entry.speaker,
    resource.entry.context, resource.lineId, resource.field,
  ]));
  return [await atomicWrite(path.join(directory, `${slug}.godot.csv`), `${rows.join("\n")}\n`)];
}

async function exportUnreal(directory: string, slug: string, languages: string[], values: StringResource[]): Promise<string[]> {
  return Promise.all(languages.map(async (language) => {
    const rows = [csvRow(["Key", "SourceString", "Context", "Speaker", "LineID", "Field"])];
    for (const resource of values) rows.push(csvRow([
      resource.key, unreal(resource.values[language] ?? ""), unreal(resourceComment(resource)), resource.entry.speaker, resource.lineId, resource.field,
    ]));
    return atomicWrite(path.join(directory, localeForUnreal(language), `${slug}.csv`), `${rows.join("\n")}\n`);
  }));
}

interface YarnLocation {
  file: string;
  node: string;
  lineNumber: number;
}

function yarnText(value: string): string {
  return value.replace(/\r?\n/gu, " ").replace(/[\\#{}[\]<>]/gu, (character) => `\\${character}`).replaceAll("//", "\\/\\/").trim();
}

function yarnSpeaker(value: string): string {
  return value.replace(/[:#\r\n]/gu, "").trim();
}

function hasMenuText(node: DialogueNodeRecord): boolean {
  return node.texts.some((value) => Boolean(value.menuText));
}

function yarnNodeTitle(conversationNumericId: number, node: DialogueNodeRecord): string {
  return node.kind === "start" ? `C${conversationNumericId}_Start` : `C${conversationNumericId}_E${node.entryNumericId}`;
}

/** Builds one `.yarn` script per scene so the strings tables have real lines to bind to. */
function buildYarnScripts(reed: ReedProject, defaultLanguage: string): { scripts: Map<string, string>; locations: Map<string, YarnLocation> } {
  const characters = new Map(reed.listCharacters().map((character) => [character.id, character]));
  const scenes = new Map(reed.listScenes().map((scene) => [scene.id, scene]));
  const graphs = reed.listConversations().map((conversation) => reed.getConversation(conversation.id));
  const titles = new Map<string, string>();
  for (const graph of graphs) for (const node of graph.nodes) titles.set(node.id, yarnNodeTitle(graph.numericId, node));
  const nodeById = new Map(graphs.flatMap((graph) => graph.nodes.map((node) => [node.id, node] as const)));
  const bySceneFile = new Map<string, string[]>();
  const locations = new Map<string, YarnLocation>();
  const sortedGraphs = [...graphs].sort((left, right) => (scenes.get(left.sceneId)?.sortOrder ?? 0) - (scenes.get(right.sceneId)?.sortOrder ?? 0)
    || left.numericId - right.numericId || left.id.localeCompare(right.id));
  for (const graph of sortedGraphs) {
    const file = `${safeFilePart(scenes.get(graph.sceneId)?.slug ?? "scene")}.yarn`;
    const lines = bySceneFile.get(file) ?? [];
    bySceneFile.set(file, lines);
    const push = (line: string, key?: string, title?: string) => {
      lines.push(line);
      if (key && title) locations.set(key, { file, node: title, lineNumber: lines.length });
    };
    for (const node of [...graph.nodes].sort((left, right) => left.entryNumericId - right.entryNumericId || left.id.localeCompare(right.id))) {
      const title = titles.get(node.id) ?? yarnNodeTitle(graph.numericId, node);
      if (lines.length > 0) push("");
      push(`title: ${title}`);
      push(`tags: reed ${node.kind}`);
      push("---");
      if (node.conditions.trim()) push(`// Pixel Crushers condition: ${node.conditions.replace(/\r?\n/gu, " ")}`);
      const text = selectedText(node, defaultLanguage, "text");
      const spokenHere = node.kind === "line" || (node.kind === "choice" && hasMenuText(node));
      if (spokenHere && text.trim()) {
        const speaker = node.speakerCharacterId ? yarnSpeaker(characters.get(node.speakerCharacterId)?.name ?? "") : "";
        push(`${speaker ? `${speaker}: ` : ""}${yarnText(text)} #line:${node.lineId}`, node.lineId, title);
      }
      const children = graph.links.filter((link) => link.originNodeId === node.id)
        .sort((left, right) => left.priority - right.priority || left.id.localeCompare(right.id))
        .map((link) => nodeById.get(link.destinationNodeId))
        .filter((child): child is DialogueNodeRecord => Boolean(child));
      const options = children.filter((child) => child.kind === "choice");
      for (const option of options) {
        const optionKey = hasMenuText(option) ? `${option.lineId}.menu` : option.lineId;
        const optionText = selectedText(option, defaultLanguage, "menuText") || selectedText(option, defaultLanguage, "text");
        push(`-> ${yarnText(optionText) || "…"} #line:${optionKey}`, optionKey, title);
        push(`    <<jump ${titles.get(option.id)}>>`);
      }
      const next = children.find((child) => child.kind !== "choice");
      if (options.length === 0) push(next ? `<<jump ${titles.get(next.id)}>>` : "<<stop>>");
      push("===");
    }
  }
  return { scripts: new Map([...bySceneFile].map(([file, lines]) => [file, `${lines.join("\n")}\n`])), locations };
}

async function exportYarn(reed: ReedProject, directory: string, slug: string, defaultLanguage: string, languages: string[], values: StringResource[]): Promise<string[]> {
  const { scripts, locations } = buildYarnScripts(reed, defaultLanguage);
  const scriptPaths = await Promise.all([...scripts].map(([file, contents]) => atomicWrite(path.join(directory, file), contents)));
  const stringPaths = await Promise.all(languages.map(async (language) => {
    const rows = [csvRow(["language", "id", "text", "file", "node", "lineNumber", "lock", "comment"])];
    for (const resource of values) {
      const location = locations.get(resource.key);
      if (!location) continue;
      const source = resource.values[defaultLanguage] ?? "";
      rows.push(csvRow([
        language, `line:${resource.key}`, resource.values[language] ?? "", location.file, location.node,
        location.lineNumber, yarnLock(source), resourceComment(resource),
      ]));
    }
    return atomicWrite(path.join(directory, `${slug}.${language}.strings.csv`), `${rows.join("\n")}\n`);
  }));
  return [...scriptPaths, ...stringPaths];
}

function poHeader(language: string, projectName: string): string {
  return [
    'msgid ""', 'msgstr ""',
    `"Project-Id-Version: ${po(projectName)}\\n"`,
    `"Language: ${po(language)}\\n"`,
    '"MIME-Version: 1.0\\n"',
    '"Content-Type: text/plain; charset=UTF-8\\n"',
    '"Content-Transfer-Encoding: 8bit\\n"',
  ].join("\n");
}

async function exportGettext(directory: string, slug: string, projectName: string, defaultLanguage: string, languages: string[], values: StringResource[]): Promise<string[]> {
  return Promise.all(languages.map(async (language) => {
    const blocks = [poHeader(language, projectName)];
    for (const resource of values) blocks.push([
      `#. ${po(resourceComment(resource))}`,
      `#: ${po(resource.entry.sceneSlug)}:${resource.entry.entryNumericId}`,
      `msgctxt "${po(resource.key)}"`,
      `msgid "${po(resource.values[defaultLanguage] ?? "")}"`,
      `msgstr "${po(language === defaultLanguage ? resource.values[defaultLanguage] ?? "" : resource.values[language] ?? "")}"`,
    ].join("\n"));
    return atomicWrite(path.join(directory, `${slug}.${language}.po`), `${blocks.join("\n\n")}\n`);
  }));
}

async function exportXliff(directory: string, slug: string, projectName: string, defaultLanguage: string, languages: string[], values: StringResource[]): Promise<string[]> {
  const targets = languages.filter((language) => language !== defaultLanguage);
  const outputLanguages = targets.length ? targets : [defaultLanguage];
  return Promise.all(outputLanguages.map(async (language) => {
    const units = values.map((resource) => [
      `    <unit id="${xml(resource.key)}" name="${xml(resource.key)}">`,
      `      <notes><note category="context">${xml(resourceComment(resource))}</note><note category="reed-line-id">${xml(resource.lineId)}</note></notes>`,
      "      <segment>",
      `        <source>${xml(resource.values[defaultLanguage] ?? "")}</source>`,
      ...(language === defaultLanguage ? [] : [`        <target>${xml(resource.values[language] ?? "")}</target>`]),
      "      </segment>",
      "    </unit>",
    ].join("\n")).join("\n");
    const targetAttribute = language === defaultLanguage ? "" : ` trgLang="${xml(language)}"`;
    const document = `<?xml version="1.0" encoding="UTF-8"?>\n<xliff xmlns="urn:oasis:names:tc:xliff:document:2.0" version="2.0" srcLang="${xml(defaultLanguage)}"${targetAttribute}>\n  <file id="${xml(slug)}" original="${xml(projectName)}">\n${units}\n  </file>\n</xliff>\n`;
    return atomicWrite(path.join(directory, `${slug}.${language}.xliff`), document);
  }));
}

export async function exportGameData(reed: ReedProject, options: GameExportOptions): Promise<GameExportResult> {
  if (!GAME_EXPORT_FORMATS.includes(options.format)) throw new ConflictError("Unsupported game export format", { format: options.format, formats: GAME_EXPORT_FORMATS });
  const project = reed.getProject();
  const languages = enabledLanguages(reed, options.languages);
  // Keep the source language available for bilingual formats even when callers
  // request only target-language output files.
  const entries = collectEntries(reed, project.languages);
  const stringResources = resources(entries);
  const directory = path.resolve(options.outputDirectory ?? path.join(reed.paths.exports, "integrations", options.format));
  await mkdir(directory, { recursive: true });
  const args = [directory, safeFilePart(project.slug)] as const;
  let filePaths: string[];
  switch (options.format) {
    case "json": filePaths = await exportJson(...args, project.name, project.defaultLanguage, languages, entries); break;
    case "csv": filePaths = await exportCsv(...args, languages, entries); break;
    case "unity-localization": filePaths = await exportUnity(...args, languages, stringResources); break;
    case "godot": filePaths = await exportGodot(...args, languages, stringResources); break;
    case "unreal-string-table": filePaths = await exportUnreal(...args, languages, stringResources); break;
    case "yarn-spinner": filePaths = await exportYarn(reed, ...args, project.defaultLanguage, languages, stringResources); break;
    case "gettext": filePaths = await exportGettext(...args, project.name, project.defaultLanguage, languages, stringResources); break;
    case "xliff-2.0": filePaths = await exportXliff(...args, project.name, project.defaultLanguage, languages, stringResources); break;
  }
  return { format: options.format, outputDirectory: directory, filePaths, languages, entryCount: entries.length };
}
