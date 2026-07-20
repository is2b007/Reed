import { existsSync } from "node:fs";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import fontkit from "@pdf-lib/fontkit";
import ExcelJS from "exceljs";
import { PDFDocument, rgb, type PDFFont, type PDFPage, type RGB } from "pdf-lib";
import { ConflictError } from "./errors.js";
import type { CharacterRecord, ConversationGraph, DialogueNodeRecord, ProjectRecord } from "./models.js";
import type { ReedProject } from "./project.js";

export interface VoiceExportOptions {
  outputDirectory?: string;
  language?: string;
  characterIds?: string[];
  voiceStatuses?: string[];
  lineStatuses?: string[];
}

export interface VoiceLineRow {
  lineId: string;
  characterId: string | null;
  characterNumericId: number | null;
  character: string;
  listener: string;
  exportLanguage: string;
  spokenLanguage: string;
  lineType: string;
  spokenText: string;
  precedingSpeaker: string;
  precedingLine: string;
  followingSpeaker: string;
  followingLine: string;
  pronunciation: string;
  context: string;
  performance: string;
  lineStatus: string;
  voiceStatus: string;
  scene: string;
  conversation: string;
  wordCount: number;
  estimatedSeconds: number;
  recordingFile: string;
  sortOrder: string;
}

function csvValue(value: string | number): string {
  return `"${String(value).replaceAll('"', '""')}"`;
}

function selectedText(node: DialogueNodeRecord, language: string): string {
  return node.texts.find((text) => text.language === language)?.text ?? "";
}

function fallbackText(node: DialogueNodeRecord, language: string): string {
  return selectedText(node, language)
    || node.texts.find((text) => text.language === node.spokenLanguage)?.text
    || node.texts[0]?.text
    || "";
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

function speakerName(node: DialogueNodeRecord | undefined, characters: Map<string, CharacterRecord>): string {
  if (!node?.speakerCharacterId) return "";
  return characters.get(node.speakerCharacterId)?.name ?? "Unknown";
}

export function getVoiceRows(reed: ReedProject, options: VoiceExportOptions = {}): VoiceLineRow[] {
  const project = reed.getProject();
  const language = options.language ?? project.defaultLanguage;
  if (!project.languages.includes(language)) throw new ConflictError("Voice export language is not enabled for this project", { language });
  const characters = new Map(reed.listCharacters().map((character) => [character.id, character]));
  const scenes = new Map(reed.listScenes().map((scene) => [scene.id, scene]));
  const rows: VoiceLineRow[] = [];
  for (const conversation of reed.listConversations()) {
    const graph = reed.getConversation(conversation.id);
    const context = shortestContext(graph);
    const byId = new Map(graph.nodes.map((node) => [node.id, node]));
    const scene = scenes.get(conversation.sceneId);
    for (const node of graph.nodes) {
      if (node.kind === "start" || node.kind === "group") continue;
      if (options.characterIds && (!node.speakerCharacterId || !options.characterIds.includes(node.speakerCharacterId))) continue;
      if (options.voiceStatuses && !options.voiceStatuses.includes(node.voiceStatus)) continue;
      if (options.lineStatuses && !options.lineStatuses.includes(node.lineStatus)) continue;
      const neighbors = context.get(node.id);
      const before = neighbors?.before ? byId.get(neighbors.before) : undefined;
      const after = neighbors?.after ? byId.get(neighbors.after) : undefined;
      const character = node.speakerCharacterId ? characters.get(node.speakerCharacterId) : undefined;
      const spokenText = selectedText(node, language);
      const wordCount = spokenText.trim() ? spokenText.trim().split(/\s+/u).length : 0;
      rows.push({
        lineId: node.lineId,
        characterId: node.speakerCharacterId,
        characterNumericId: character?.numericId ?? null,
        character: character?.name ?? "Unassigned",
        listener: node.listenerCharacterId ? characters.get(node.listenerCharacterId)?.name ?? "Unknown" : "",
        exportLanguage: language,
        spokenLanguage: node.spokenLanguage,
        lineType: node.kind,
        spokenText,
        precedingSpeaker: speakerName(before, characters),
        precedingLine: before ? fallbackText(before, language) : "",
        followingSpeaker: speakerName(after, characters),
        followingLine: after ? fallbackText(after, language) : "",
        pronunciation: node.pronunciation,
        context: node.contextComment,
        performance: node.voiceComment,
        lineStatus: node.lineStatus,
        voiceStatus: node.voiceStatus,
        scene: scene?.name ?? "",
        conversation: conversation.title,
        wordCount,
        estimatedSeconds: Number(((wordCount / 150) * 60).toFixed(1)),
        recordingFile: `${node.lineId}.wav`,
        sortOrder: [String(character?.numericId ?? 999_999).padStart(6, "0"), String(scene?.sortOrder ?? 0).padStart(6, "0"), String(conversation.numericId).padStart(8, "0"), String(node.entryNumericId).padStart(8, "0")].join(":"),
      });
    }
  }
  return rows.sort((a, b) => a.sortOrder.localeCompare(b.sortOrder) || a.lineId.localeCompare(b.lineId));
}

function voiceBudgetFromRows(rows: VoiceLineRow[]) {
  const characters = new Map<string, { character: string; lines: number; words: number; estimatedMinutes: number }>();
  for (const row of rows) {
    const value = characters.get(row.character) ?? { character: row.character, lines: 0, words: 0, estimatedMinutes: 0 };
    value.lines += 1;
    value.words += row.wordCount;
    value.estimatedMinutes = Number((value.words / 150).toFixed(2));
    characters.set(row.character, value);
  }
  return [...characters.values()].sort((a, b) => b.words - a.words || a.character.localeCompare(b.character));
}

export function getVoiceBudget(reed: ReedProject, language?: string) {
  return voiceBudgetFromRows(getVoiceRows(reed, { language }));
}

function languageLabel(code: string): string {
  const names: Record<string, string> = { en: "English", el: "Greek", it: "Italian", de: "German", grk: "Griko" };
  return names[code.toLowerCase()] ? `${names[code.toLowerCase()]} (${code.toUpperCase()})` : code.toUpperCase();
}

interface PdfFonts {
  latin: PDFFont;
  latinBold: PDFFont;
  latinExtended: PDFFont;
  latinExtendedBold: PDFFont;
  greek: PDFFont;
  greekBold: PDFFont;
  greekExtended: PDFFont;
  greekExtendedBold: PDFFont;
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

function fontForCharacter(value: string, fonts: PdfFonts, bold: boolean): PDFFont {
  if (/[\u1f00-\u1fff]/u.test(value)) return bold ? fonts.greekExtendedBold : fonts.greekExtended;
  if (/[\u0370-\u03ff]/u.test(value)) return bold ? fonts.greekBold : fonts.greek;
  if (/[\u0100-\u024f]/u.test(value)) return bold ? fonts.latinExtendedBold : fonts.latinExtended;
  return bold ? fonts.latinBold : fonts.latin;
}

function richTextWidth(value: string, fonts: PdfFonts, size: number, bold: boolean): number {
  return [...value].reduce((width, character) => width + fontForCharacter(character, fonts, bold).widthOfTextAtSize(character, size), 0);
}

function wrapRichText(value: string, fonts: PdfFonts, size: number, width: number, bold = false): string[] {
  const lines: string[] = [];
  for (const paragraph of value.split(/\r?\n/u)) {
    const tokens = paragraph.split(/(\s+)/u).filter(Boolean);
    let current = "";
    for (const token of tokens) {
      const candidate = `${current}${token}`;
      if (richTextWidth(candidate, fonts, size, bold) <= width) {
        current = candidate;
        continue;
      }
      if (current.trim()) lines.push(current.trimEnd());
      current = token.trimStart();
      while (current && richTextWidth(current, fonts, size, bold) > width) {
        let cut = 1;
        while (cut < [...current].length && richTextWidth([...current].slice(0, cut + 1).join(""), fonts, size, bold) <= width) cut += 1;
        const characters = [...current];
        lines.push(characters.slice(0, cut).join(""));
        current = characters.slice(cut).join("");
      }
    }
    lines.push(current.trimEnd());
  }
  return lines.length ? lines : [""];
}

function drawRichLine(page: PDFPage, value: string, x: number, y: number, size: number, color: RGB, fonts: PdfFonts, bold = false): void {
  let cursor = x;
  let activeFont: PDFFont | null = null;
  let run = "";
  const flush = () => {
    if (!run || !activeFont) return;
    page.drawText(run, { x: cursor, y, size, font: activeFont, color });
    cursor += activeFont.widthOfTextAtSize(run, size);
    run = "";
  };
  for (const character of value || " ") {
    const nextFont = fontForCharacter(character, fonts, bold);
    if (activeFont && nextFont !== activeFont) flush();
    activeFont = nextFont;
    run += character;
  }
  flush();
}

function safeFilename(value: string): string {
  const normalized = value.normalize("NFKC").trim().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^-+|-+$/gu, "");
  return normalized || "actor";
}

async function loadPdfFonts(pdf: PDFDocument): Promise<PdfFonts> {
  const load = async (filename: string) => pdf.embedFont(await readFile(resolveFontFile(filename)), { subset: true });
  return {
    latin: await load("noto-sans-latin-400-normal.woff"),
    latinBold: await load("noto-sans-latin-600-normal.woff"),
    latinExtended: await load("noto-sans-latin-ext-400-normal.woff"),
    latinExtendedBold: await load("noto-sans-latin-ext-600-normal.woff"),
    greek: await load("noto-sans-greek-400-normal.woff"),
    greekBold: await load("noto-sans-greek-600-normal.woff"),
    greekExtended: await load("noto-sans-greek-ext-400-normal.woff"),
    greekExtendedBold: await load("noto-sans-greek-ext-600-normal.woff"),
  };
}

async function createVoicePdf(rows: VoiceLineRow[], characters: CharacterRecord[], project: ProjectRecord, language: string, target: string, actorOnly = false): Promise<void> {
  const pdf = await PDFDocument.create();
  pdf.registerFontkit(fontkit);
  pdf.setTitle(`${project.name} - voice session - ${language.toUpperCase()}`);
  pdf.setAuthor("Reed");
  pdf.setSubject("Voice actor recording script and line handoff");
  const fonts = await loadPdfFonts(pdf);
  const ink = rgb(0.09, 0.12, 0.1);
  const muted = rgb(0.37, 0.42, 0.38);
  const reed = rgb(0.24, 0.36, 0.13);
  const rule = rgb(0.77, 0.81, 0.76);
  const soft = rgb(0.94, 0.96, 0.93);
  let page = pdf.addPage([595, 842]);
  let y = 795;
  let runningHeader = project.name;
  const drawPageHeader = (header: string) => {
    drawRichLine(page, header, 40, 810, 8, muted, fonts, true);
    page.drawLine({ start: { x: 40, y: 801 }, end: { x: 555, y: 801 }, thickness: 0.7, color: rule });
  };
  const addPage = (header = runningHeader) => {
    page = pdf.addPage([595, 842]);
    y = 775;
    if (header) drawPageHeader(header);
  };
  const paragraphLines = (value: string, size: number, width = 515, bold = false) => wrapRichText(value, fonts, size, width, bold);
  const paragraphHeight = (value: string, size: number, width = 515, bold = false, leading = 1.4) => paragraphLines(value, size, width, bold).length * size * leading;
  const drawParagraph = (value: string, size: number, color = ink, bold = false, indent = 0, width = 515 - indent, leading = 1.4) => {
    for (const line of paragraphLines(value, size, width, bold)) {
      drawRichLine(page, line, 40 + indent, y, size, color, fonts, bold);
      y -= size * leading;
    }
  };
  const ensureSpace = (height: number) => { if (y - height < 58) addPage(); };

  const grouped = new Map<string, VoiceLineRow[]>();
  for (const row of rows) grouped.set(row.characterId ?? "unassigned", [...(grouped.get(row.characterId ?? "unassigned") ?? []), row]);
  const totalWords = rows.reduce((sum, row) => sum + row.wordCount, 0);
  if (!actorOnly) {
    runningHeader = "";
    y = 760;
    drawParagraph("VOICE SESSION PACKAGE", 10, reed, true);
    y -= 10;
    drawParagraph(project.name, 30, ink, true);
    drawParagraph(`${languageLabel(language)} recording script`, 16, muted);
    y -= 26;
    page.drawRectangle({ x: 40, y: y - 102, width: 515, height: 102, color: soft, borderColor: rule, borderWidth: 0.8 });
    const summaryY = y - 26;
    drawRichLine(page, `${rows.length}`, 60, summaryY, 22, reed, fonts, true);
    drawRichLine(page, "LINES", 60, summaryY - 20, 8, muted, fonts, true);
    drawRichLine(page, `${totalWords}`, 195, summaryY, 22, reed, fonts, true);
    drawRichLine(page, "WORDS", 195, summaryY - 20, 8, muted, fonts, true);
    drawRichLine(page, `${(totalWords / 150).toFixed(1)} min`, 330, summaryY, 22, reed, fonts, true);
    drawRichLine(page, "EST. READ TIME", 330, summaryY - 20, 8, muted, fonts, true);
    drawRichLine(page, `v${project.version}`, 465, summaryY, 22, reed, fonts, true);
    drawRichLine(page, "PROJECT REVISION", 465, summaryY - 20, 8, muted, fonts, true);
    y -= 130;
    drawParagraph("RECORDING GUIDE", 10, reed, true);
    y -= 5;
    drawParagraph("Record the large dialogue text only. Name every delivered WAV exactly as the listed recording file. Use the pronunciation and performance notes before reading. Mark pickups and take notes in the studio workbook.", 11, ink, false, 0, 500, 1.55);
    y -= 22;
    drawParagraph("PACKAGE CONTENTS", 10, reed, true);
    y -= 5;
    drawParagraph("Studio master PDF | one PDF per actor | editable XLSX tracker | CSV interchange file", 11, ink);
    y -= 22;
    drawParagraph("CAST", 10, reed, true);
    y -= 5;
    for (const [characterId, actorRows] of grouped) {
      const character = characters.find((candidate) => candidate.id === characterId);
      drawParagraph(`${character?.name ?? "Unassigned"} - ${actorRows.length} ${actorRows.length === 1 ? "line" : "lines"} - ${actorRows.reduce((sum, row) => sum + row.wordCount, 0)} words`, 10, ink);
    }
  }

  let actorIndex = 0;
  for (const [characterId, actorRows] of grouped) {
    const character = characters.find((candidate) => candidate.id === characterId);
    const characterName = character?.name ?? "Unassigned";
    runningHeader = `${project.name} | ${characterName} | ${language.toUpperCase()}`;
    if (actorOnly && actorIndex === 0) { y = 775; drawPageHeader(runningHeader); }
    else addPage(runningHeader);
    drawParagraph("ACTOR PACKET", 9, reed, true);
    y -= 14;
    drawParagraph(characterName, 25, ink, true);
    const localizedName = character?.displayNames[language];
    if (localizedName && localizedName !== characterName) drawParagraph(`Display name: ${localizedName}`, 10, muted);
    if (character?.description) { y -= 5; drawParagraph(character.description, 11, ink, false, 0, 500, 1.5); }
    if (character?.actorNotes) { y -= 5; drawParagraph(`Character direction: ${character.actorNotes}`, 10, muted, false, 0, 500, 1.45); }
    if (character?.voiceNotes) drawParagraph(`Voice / accent notes: ${character.voiceNotes}`, 10, muted, false, 0, 500, 1.45);
    const actorWords = actorRows.reduce((sum, row) => sum + row.wordCount, 0);
    y -= 8;
    drawParagraph(`${actorRows.length} ${actorRows.length === 1 ? "line" : "lines"} | ${actorWords} words | approx. ${(actorWords / 150).toFixed(1)} minutes at 150 wpm`, 9, reed, true);
    y -= 14;
    page.drawLine({ start: { x: 40, y }, end: { x: 555, y }, thickness: 1.2, color: reed });
    y -= 20;

    actorRows.forEach((row, index) => {
      const before = row.precedingLine ? `${row.precedingSpeaker ? `${row.precedingSpeaker}: ` : ""}${row.precedingLine}` : "";
      const after = row.followingLine ? `${row.followingSpeaker ? `${row.followingSpeaker}: ` : ""}${row.followingLine}` : "";
      const itemType = row.lineType === "line" ? "DIALOGUE" : row.lineType.toUpperCase();
      const meta = `LINE ${String(index + 1).padStart(3, "0")} | ${row.scene} / ${row.conversation} | ${itemType}`;
      let required = 48 + paragraphHeight(meta, 8.5, 500, true) + paragraphHeight(row.spokenText, 14, 483, true, 1.55);
      if (before) required += paragraphHeight(`Before: ${before}`, 9, 483, false, 1.4) + 5;
      if (after) required += paragraphHeight(`After: ${after}`, 9, 483, false, 1.4) + 5;
      if (row.pronunciation) required += paragraphHeight(`Pronunciation: ${row.pronunciation}`, 9.5, 483, true, 1.4) + 5;
      if (row.performance) required += paragraphHeight(`Performance: ${row.performance}`, 9.5, 483, false, 1.4) + 5;
      if (row.context) required += paragraphHeight(`Story context: ${row.context}`, 9, 483, false, 1.4) + 5;
      ensureSpace(required);
      drawParagraph(meta, 8.5, reed, true, 0, 500, 1.35);
      drawParagraph(`${row.lineId} | FILE: ${row.recordingFile} | ${row.wordCount} words | ${row.estimatedSeconds.toFixed(1)} sec`, 8, muted, false, 0, 500, 1.35);
      y -= 5;
      if (before) drawParagraph(`Before: ${before}`, 9, muted, false, 12, 483, 1.4);
      if (row.pronunciation) { y -= 3; drawParagraph(`Pronunciation: ${row.pronunciation}`, 9.5, reed, true, 12, 483, 1.4); }
      if (row.performance) drawParagraph(`Performance: ${row.performance}`, 9.5, ink, false, 12, 483, 1.4);
      if (row.context) drawParagraph(`Story context: ${row.context}`, 9, muted, false, 12, 483, 1.4);
      y -= 7;
      drawParagraph(row.spokenText || `[MISSING ${language.toUpperCase()} TEXT]`, 14, ink, true, 12, 483, 1.55);
      y -= 5;
      if (after) drawParagraph(`After: ${after}`, 9, muted, false, 12, 483, 1.4);
      y -= 8;
      page.drawRectangle({ x: 52, y: y - 18, width: 491, height: 24, color: soft, borderColor: rule, borderWidth: 0.6 });
      drawRichLine(page, "TAKE ____   PICKUP [ ]   ALT [ ]   STUDIO NOTES: ______________________________", 62, y - 10, 8, muted, fonts, true);
      y -= 38;
    });
    actorIndex += 1;
  }

  const pages = pdf.getPages();
  pages.forEach((pdfPage, index) => {
    pdfPage.drawLine({ start: { x: 40, y: 42 }, end: { x: 555, y: 42 }, thickness: 0.6, color: rule });
    drawRichLine(pdfPage, `${project.name} | ${language.toUpperCase()} | generated ${new Date().toISOString().slice(0, 10)}`, 40, 27, 7.5, muted, fonts);
    const pageLabel = `${index + 1} / ${pages.length}`;
    drawRichLine(pdfPage, pageLabel, 555 - richTextWidth(pageLabel, fonts, 7.5, true), 27, 7.5, muted, fonts, true);
  });
  await writeFile(target, await pdf.save());
}

function workbookRows(rows: VoiceLineRow[]): Array<Array<string | number>> {
  return rows.map((row) => [
    row.lineId, row.recordingFile, row.character, row.listener, row.scene, row.conversation, row.spokenText,
    row.pronunciation, row.performance, row.context, row.precedingSpeaker, row.precedingLine, row.followingSpeaker,
    row.followingLine, row.lineStatus, row.voiceStatus, row.wordCount, row.estimatedSeconds, "Not started", "No", "",
  ]);
}

function styleVoiceWorkbook(workbook: ExcelJS.Workbook, rows: VoiceLineRow[], project: ProjectRecord, language: string): void {
  workbook.creator = "Reed";
  workbook.title = `${project.name} voice session`;
  workbook.subject = `${languageLabel(language)} voice recording package`;
  workbook.created = new Date();
  const dark = "FF123F46";
  const reed = "FF54751F";
  const pale = "FFF1F5ED";
  const border = "FFD7DED3";
  const summary = workbook.addWorksheet("Session Summary", { views: [{ showGridLines: false }] });
  summary.columns = [{ width: 3 }, { width: 24 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 3 }];
  summary.mergeCells("B2:G3");
  summary.getCell("B2").value = project.name;
  summary.getCell("B2").font = { name: "Arial", size: 22, bold: true, color: { argb: dark } };
  summary.getCell("B2").alignment = { vertical: "middle" };
  summary.mergeCells("B4:G4");
  summary.getCell("B4").value = `${languageLabel(language)} voice session package | project revision ${project.version} | ${new Date().toISOString().slice(0, 10)}`;
  summary.getCell("B4").font = { name: "Arial", size: 10, color: { argb: "FF657067" } };
  const totalWords = rows.reduce((sum, row) => sum + row.wordCount, 0);
  const metrics: Array<[string, string | number]> = [["Lines", rows.length], ["Words", totalWords], ["Est. read time", `${(totalWords / 150).toFixed(1)} min`], ["Actors", new Set(rows.map((row) => row.character)).size]];
  metrics.forEach(([label, value], index) => {
    const column = 2 + index;
    const cell = summary.getCell(6, column);
    cell.value = value;
    cell.font = { name: "Arial", size: 18, bold: true, color: { argb: reed } };
    cell.alignment = { horizontal: "center" };
    summary.getCell(7, column).value = label;
    summary.getCell(7, column).font = { name: "Arial", size: 9, bold: true, color: { argb: "FF657067" } };
    summary.getCell(7, column).alignment = { horizontal: "center" };
  });
  summary.mergeCells("B9:G9");
  summary.getCell("B9").value = "RECORDING GUIDE";
  summary.getCell("B9").font = { name: "Arial", size: 10, bold: true, color: { argb: reed } };
  summary.mergeCells("B10:G12");
  summary.getCell("B10").value = "Record the Dialogue cell only. Deliver each WAV using the exact File name. Check Pronunciation and Performance direction before the read. Track takes and pickups in the final three columns of Voice Lines.";
  summary.getCell("B10").alignment = { wrapText: true, vertical: "top" };
  summary.getCell("B10").font = { name: "Arial", size: 11, color: { argb: "FF1B241D" } };
  summary.mergeCells("B14:G14");
  summary.getCell("B14").value = "CAST AND SESSION ESTIMATE";
  summary.getCell("B14").font = { name: "Arial", size: 10, bold: true, color: { argb: reed } };
  const budgetByActor = new Map<string, { lines: number; words: number }>();
  rows.forEach((row) => {
    const value = budgetByActor.get(row.character) ?? { lines: 0, words: 0 };
    value.lines += 1; value.words += row.wordCount; budgetByActor.set(row.character, value);
  });
  const budgetHeaderRow = 15;
  for (let column = 2; column <= 5; column += 1) {
    const cell = summary.getCell(budgetHeaderRow, column);
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
    cell.font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  }
  ["Actor", "Lines", "Words", "Est. minutes"].forEach((value, index) => { summary.getCell(budgetHeaderRow, 2 + index).value = value; });
  [...budgetByActor.entries()].forEach(([actor, value], index) => {
    const row = budgetHeaderRow + 1 + index;
    summary.getCell(row, 2).value = actor;
    summary.getCell(row, 3).value = value.lines;
    summary.getCell(row, 4).value = value.words;
    summary.getCell(row, 5).value = Number((value.words / 150).toFixed(2));
    for (let column = 2; column <= 5; column += 1) {
      const cell = summary.getCell(row, column);
      cell.font = { name: "Arial", size: 10, color: { argb: "FF1B241D" } };
      cell.border = { bottom: { style: "thin", color: { argb: border } } };
    }
  });
  summary.pageSetup = { orientation: "portrait", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 1, margins: { left: 0.5, right: 0.5, top: 0.55, bottom: 0.55, header: 0.2, footer: 0.2 } };
  summary.pageSetup.printArea = `B2:G${Math.max(18, budgetHeaderRow + budgetByActor.size + 1)}`;

  const sheet = workbook.addWorksheet("Voice Lines", { views: [{ state: "frozen", xSplit: 3, ySplit: 1, showGridLines: false }] });
  const columns = [
    ["Line ID", 30], ["File name", 32], ["Actor", 18], ["Listener", 18], ["Scene", 18], ["Conversation", 24], ["Dialogue", 52],
    ["Pronunciation", 30], ["Performance direction", 32], ["Story context", 32], ["Previous speaker", 18], ["Previous line", 38],
    ["Next speaker", 18], ["Next line", 38], ["Text status", 14], ["Voice status", 14], ["Words", 10], ["Est. seconds", 12],
    ["Take status", 18], ["Pickup", 12], ["Studio notes", 36],
  ] as const;
  sheet.columns = columns.map(([, width]) => ({ width }));
  sheet.addTable({ name: "VoiceLines", ref: "A1", headerRow: true, totalsRow: false, style: { theme: "TableStyleMedium2", showRowStripes: true }, columns: columns.map(([name]) => ({ name })), rows: workbookRows(rows) });
  sheet.getRow(1).height = 28;
  sheet.getRow(1).font = { name: "Arial", size: 10, bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: dark } };
  for (let row = 2; row <= rows.length + 1; row += 1) {
    sheet.getRow(row).height = 58;
    sheet.getRow(row).font = { name: "Arial", size: 10, color: { argb: "FF1B241D" } };
    sheet.getRow(row).alignment = { vertical: "top", wrapText: true };
    sheet.getCell(row, 7).font = { name: "Arial", size: 11, bold: true, color: { argb: dark } };
    sheet.getCell(row, 19).dataValidation = { type: "list", allowBlank: false, formulae: ['"Not started,Recorded,Pickup needed,Approved"'] };
    sheet.getCell(row, 20).dataValidation = { type: "list", allowBlank: false, formulae: ['"No,Yes"'] };
  }
  sheet.getColumn(17).numFmt = "0";
  sheet.getColumn(18).numFmt = "0.0";
  sheet.pageSetup = { orientation: "landscape", paperSize: 9, fitToPage: true, fitToWidth: 1, fitToHeight: 0, margins: { left: 0.25, right: 0.25, top: 0.45, bottom: 0.45, header: 0.2, footer: 0.2 }, printTitlesRow: "1:1" };
  sheet.pageSetup.printArea = `A1:I${rows.length + 1}`;
  sheet.headerFooter.oddHeader = `&L${project.name}&C${language.toUpperCase()} voice lines&RPage &P of &N`;
  sheet.headerFooter.oddFooter = "&LGenerated by Reed&CUse exact WAV file names&RStudio tracker";
  sheet.getColumn(19).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } };
  sheet.getColumn(20).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } };
  sheet.getColumn(21).fill = { type: "pattern", pattern: "solid", fgColor: { argb: pale } };
}

export async function exportVoicePackage(reed: ReedProject, options: VoiceExportOptions = {}) {
  const project = reed.getProject();
  const language = options.language ?? project.defaultLanguage;
  const output = path.resolve(options.outputDirectory ?? path.join(reed.paths.exports, "voice"));
  await mkdir(output, { recursive: true });
  const rows = getVoiceRows(reed, options);
  if (!rows.length) throw new ConflictError("No dialogue lines match this voice export selection");
  const missingText = rows.filter((row) => !row.spokenText.trim()).map((row) => row.lineId);
  if (missingText.length) throw new ConflictError(`${missingText.length} selected ${language.toUpperCase()} voice ${missingText.length === 1 ? "line is" : "lines are"} missing text`, { language, lineIds: missingText });
  const headers: Array<keyof VoiceLineRow | "studioNotes" | "takeStatus" | "pickup"> = [
    "lineId", "character", "spokenLanguage", "spokenText", "precedingLine", "followingLine", "context", "performance", "voiceStatus", "scene", "conversation", "studioNotes",
    "listener", "exportLanguage", "lineType", "precedingSpeaker", "followingSpeaker", "pronunciation", "lineStatus", "wordCount", "estimatedSeconds", "recordingFile", "takeStatus", "pickup",
  ];
  const emptyHeaders = new Set(["studioNotes", "takeStatus", "pickup"]);
  const csv = [headers.join(","), ...rows.map((row) => headers.map((header) => csvValue(emptyHeaders.has(header) ? "" : row[header as keyof VoiceLineRow] as string | number)).join(","))].join("\n") + "\n";
  const csvPath = path.join(output, "voice-lines.csv");
  await writeFile(csvPath, csv, "utf8");
  const workbook = new ExcelJS.Workbook();
  styleVoiceWorkbook(workbook, rows, project, language);
  const xlsxPath = path.join(output, "voice-lines.xlsx");
  await workbook.xlsx.writeFile(xlsxPath);
  const pdfPath = path.join(output, "voice-actor-handoff.pdf");
  const characters = reed.listCharacters();
  await createVoicePdf(rows, characters, project, language, pdfPath);
  const actorsDirectory = path.join(output, "actors");
  await mkdir(actorsDirectory, { recursive: true });
  const actorPdfPaths: string[] = [];
  for (const character of characters.filter((candidate) => rows.some((row) => row.characterId === candidate.id)).sort((a, b) => a.numericId - b.numericId)) {
    const actorRows = rows.filter((row) => row.characterId === character.id);
    const actorPath = path.join(actorsDirectory, `${String(character.numericId).padStart(3, "0")}-${safeFilename(character.name)}-lines.pdf`);
    await createVoicePdf(actorRows, characters, project, language, actorPath, true);
    actorPdfPaths.push(actorPath);
  }
  return { rows: rows.length, csvPath, xlsxPath, pdfPath, actorPdfPaths, budget: voiceBudgetFromRows(rows) };
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
        lines.push(fallbackText(current, primary));
        if (secondaryLanguage) lines.push(`> ${fallbackText(current, secondaryLanguage)}`);
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
