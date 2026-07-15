import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { CharacterRecord, ConversationGraph, DialogueNodeRecord } from "./models.js";
import type { ReedProject } from "./project.js";

export interface VoiceExportOptions {
  outputDirectory?: string;
  language?: string;
  characterIds?: string[];
  voiceStatuses?: string[];
}

export interface VoiceLineRow {
  lineId: string;
  character: string;
  spokenLanguage: string;
  spokenText: string;
  precedingLine: string;
  followingLine: string;
  context: string;
  performance: string;
  voiceStatus: string;
  scene: string;
  conversation: string;
}

function csvValue(value: string): string {
  return `"${value.replaceAll('"', '""')}"`;
}

function selectedText(node: DialogueNodeRecord, language: string): string {
  return node.texts.find((text) => text.language === language)?.text
    ?? node.texts.find((text) => text.language === node.spokenLanguage)?.text
    ?? node.texts[0]?.text
    ?? "";
}

function shortestContext(graph: ConversationGraph): Map<string, { before: string | null; after: string | null }> {
  const start = graph.nodes.find((node) => node.kind === "start");
  const byId = new Map(graph.nodes.map((node) => [node.id, node]));
  const parent = new Map<string, string>();
  const queue = start ? [start.id] : [];
  const visited = new Set(queue);
  while (queue.length > 0) {
    const origin = queue.shift();
    if (!origin) continue;
    for (const link of graph.links.filter((candidate) => candidate.originNodeId === origin).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
      if (visited.has(link.destinationNodeId)) continue;
      visited.add(link.destinationNodeId);
      parent.set(link.destinationNodeId, origin);
      queue.push(link.destinationNodeId);
    }
  }
  const result = new Map<string, { before: string | null; after: string | null }>();
  for (const node of graph.nodes) {
    const authored = node.contextPath.map((lineId) => graph.nodes.find((candidate) => candidate.lineId === lineId)?.id).filter((id): id is string => Boolean(id));
    const beforeId = authored.at(-1) ?? parent.get(node.id) ?? null;
    const outgoing = graph.links.filter((link) => link.originNodeId === node.id).sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id));
    result.set(node.id, { before: beforeId && byId.get(beforeId)?.kind !== "start" ? beforeId : null, after: outgoing[0]?.destinationNodeId ?? null });
  }
  return result;
}

export function getVoiceRows(reed: ReedProject, options: VoiceExportOptions = {}): VoiceLineRow[] {
  const project = reed.getProject();
  const language = options.language ?? project.defaultLanguage;
  const characters = new Map(reed.listCharacters().map((character) => [character.id, character]));
  const scenes = new Map(reed.listScenes().map((scene) => [scene.id, scene]));
  const rows: VoiceLineRow[] = [];
  for (const conversation of reed.listConversations()) {
    const graph = reed.getConversation(conversation.id);
    const context = shortestContext(graph);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    for (const node of graph.nodes) {
      if (node.kind === "start" || node.kind === "group") continue;
      if (options.characterIds && (!node.speakerCharacterId || !options.characterIds.includes(node.speakerCharacterId))) continue;
      if (options.voiceStatuses && !options.voiceStatuses.includes(node.voiceStatus)) continue;
      const neighbors = context.get(node.id);
      rows.push({
        lineId: node.lineId,
        character: node.speakerCharacterId ? characters.get(node.speakerCharacterId)?.name ?? "Unknown" : "Unassigned",
        spokenLanguage: node.spokenLanguage,
        spokenText: selectedText(node, language),
        precedingLine: neighbors?.before ? selectedText(byId.get(neighbors.before) as DialogueNodeRecord, language) : "",
        followingLine: neighbors?.after ? selectedText(byId.get(neighbors.after) as DialogueNodeRecord, language) : "",
        context: node.contextComment,
        performance: node.voiceComment,
        voiceStatus: node.voiceStatus,
        scene: scenes.get(conversation.sceneId)?.name ?? "",
        conversation: conversation.title,
      });
    }
  }
  return rows.sort((a, b) => a.character.localeCompare(b.character) || a.scene.localeCompare(b.scene) || a.lineId.localeCompare(b.lineId));
}

export function getVoiceBudget(reed: ReedProject, language?: string) {
  const rows = getVoiceRows(reed, { language });
  const characters = new Map<string, { character: string; lines: number; words: number; estimatedMinutes: number }>();
  for (const row of rows) {
    const value = characters.get(row.character) ?? { character: row.character, lines: 0, words: 0, estimatedMinutes: 0 };
    value.lines += 1;
    value.words += row.spokenText.trim() ? row.spokenText.trim().split(/\s+/u).length : 0;
    value.estimatedMinutes = Number((value.words / 150).toFixed(2));
    characters.set(row.character, value);
  }
  return [...characters.values()].sort((a, b) => b.words - a.words || a.character.localeCompare(b.character));
}

function wrapText(value: string, font: PDFFont, size: number, width: number): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/u)) {
    let current = "";
    for (const word of paragraph.split(/\s+/u)) {
      const candidate = current ? `${current} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) > width && current) {
        lines.push(current);
        current = word;
      } else current = candidate;
    }
    lines.push(current);
  }
  return lines;
}

function resolveFontFile(filename: string): string {
  const relative = path.join("@fontsource", "noto-sans", "files", filename);
  const resourcesPath = (process as typeof process & { resourcesPath?: string }).resourcesPath;
  const starts = [process.cwd(), path.dirname(fileURLToPath(import.meta.url))];
  if (resourcesPath) starts.unshift(path.join(resourcesPath, "app.asar"));
  const visited = new Set<string>();
  for (const start of starts) {
    let directory = path.resolve(start);
    while (!visited.has(directory)) {
      visited.add(directory);
      const candidate = path.join(directory, "node_modules", relative);
      if (existsSync(candidate)) return candidate;
      const parent = path.dirname(directory);
      if (parent === directory) break;
      directory = parent;
    }
  }
  throw new Error(`Could not resolve voice-export font: ${filename}`);
}

async function createVoicePdf(rows: VoiceLineRow[], characters: CharacterRecord[], target: string): Promise<void> {
  const latinPath = resolveFontFile("noto-sans-latin-ext-400-normal.woff");
  const greekPath = resolveFontFile("noto-sans-greek-400-normal.woff");
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  const latin = await pdf.embedFont(await readFile(latinPath), { subset: true });
  const greek = await pdf.embedFont(await readFile(greekPath), { subset: true });
  let page: PDFPage;
  let y = 0;
  const addPage = () => {
    page = pdf.addPage([595, 842]);
    y = 800;
  };
  const draw = (value: string, size: number, color = rgb(0.12, 0.14, 0.18), indent = 0) => {
    const selected = /[\u0370-\u03ff\u1f00-\u1fff]/u.test(value) ? greek : latin;
    for (const line of wrapText(value, selected, size, 515 - indent)) {
      if (y < 55) addPage();
      page.drawText(line || " ", { x: 40 + indent, y, size, font: selected, color });
      y -= size * 1.45;
    }
  };
  addPage();
  draw("Reed voice-actor handoff", 22, rgb(0.07, 0.27, 0.3));
  draw(`Prepared ${new Date().toISOString().slice(0, 10)} · ${rows.length} lines`, 10, rgb(0.4, 0.45, 0.5));
  const grouped = new Map<string, VoiceLineRow[]>();
  for (const row of rows) grouped.set(row.character, [...(grouped.get(row.character) ?? []), row]);
  for (const [characterName, lines] of grouped) {
    addPage();
    const character = characters.find((candidate) => candidate.name === characterName);
    draw(characterName, 22, rgb(0.07, 0.27, 0.3));
    if (character?.description) draw(character.description, 11);
    if (character?.actorNotes) draw(`Performance: ${character.actorNotes}`, 10, rgb(0.35, 0.39, 0.43));
    y -= 10;
    for (const row of lines) {
      draw(`${row.lineId} · ${row.scene} / ${row.conversation}`, 9, rgb(0.42, 0.46, 0.5));
      if (row.precedingLine) draw(`Before: ${row.precedingLine}`, 9, rgb(0.45, 0.48, 0.52), 10);
      draw(row.spokenText, 13, rgb(0.08, 0.1, 0.13), 10);
      if (row.followingLine) draw(`After: ${row.followingLine}`, 9, rgb(0.45, 0.48, 0.52), 10);
      if (row.context || row.performance) draw([row.context, row.performance].filter(Boolean).join(" · "), 9, rgb(0.3, 0.34, 0.38), 10);
      y -= 12;
    }
  }
  await writeFile(target, await pdf.save());
}

export async function exportVoicePackage(reed: ReedProject, options: VoiceExportOptions = {}) {
  const output = path.resolve(options.outputDirectory ?? path.join(reed.paths.exports, "voice"));
  await mkdir(output, { recursive: true });
  const rows = getVoiceRows(reed, options);
  const headers: Array<keyof VoiceLineRow | "studioNotes"> = [
    "lineId", "character", "spokenLanguage", "spokenText", "precedingLine", "followingLine", "context", "performance", "voiceStatus", "scene", "conversation", "studioNotes",
  ];
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(header === "studioNotes" ? "" : row[header])).join(","))].join("\n") + "\n";
  const csvPath = path.join(output, "voice-lines.csv");
  await writeFile(csvPath, csv, "utf8");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Reed";
  const sheet = workbook.addWorksheet("Voice lines", { views: [{ state: "frozen", ySplit: 1 }] });
  sheet.columns = headers.map((header) => ({ header, key: header, width: header === "spokenText" ? 55 : header.includes("Line") ? 40 : 22 }));
  for (const row of rows) sheet.addRow({ ...row, studioNotes: "" });
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF123F46" } };
  sheet.autoFilter = { from: "A1", to: "L1" };
  const xlsxPath = path.join(output, "voice-lines.xlsx");
  await workbook.xlsx.writeFile(xlsxPath);
  const pdfPath = path.join(output, "voice-actor-handoff.pdf");
  await createVoicePdf(rows, reed.listCharacters(), pdfPath);
  return { rows: rows.length, csvPath, xlsxPath, pdfPath, budget: getVoiceBudget(reed, options.language) };
}

export async function exportScreenplay(reed: ReedProject, language?: string, secondaryLanguage?: string) {
  const project = reed.getProject();
  const primary = language ?? project.defaultLanguage;
  const characters = new Map(reed.listCharacters().map((character) => [character.id, character.name]));
  const scenes = new Map(reed.listScenes().map((scene) => [scene.id, scene]));
  const lines: string[] = [`# ${project.name}`, "", `Primary language: ${primary}${secondaryLanguage ? ` · Reference: ${secondaryLanguage}` : ""}`, ""];
  for (const conversation of reed.listConversations()) {
    const graph = reed.getConversation(conversation.id);
    lines.push(`## ${scenes.get(conversation.sceneId)?.name ?? "Scene"} — ${conversation.title}`, "");
    let current = graph.nodes.find((node) => node.kind === "start");
    const visited = new Set<string>();
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      if (current.kind !== "start" && current.kind !== "group") {
        lines.push(`**${current.speakerCharacterId ? characters.get(current.speakerCharacterId) ?? "Unknown" : "Unassigned"}** · \`${current.lineId}\``);
        lines.push(selectedText(current, primary));
        if (secondaryLanguage) lines.push(`> ${selectedText(current, secondaryLanguage)}`);
        lines.push("");
      }
      const next = graph.links.filter((link) => link.originNodeId === current?.id)
        .sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))[0];
      current = next ? graph.nodes.find((node) => node.id === next.destinationNodeId) : undefined;
    }
  }
  const target = path.join(reed.paths.exports, "screenplay.md");
  const temporary = `${target}.tmp`;
  await mkdir(path.dirname(target), { recursive: true });
  await writeFile(temporary, `${lines.join("\n")}\n`, "utf8");
  await rename(temporary, target);
  return target;
}
