import { mkdtemp, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { ReedProject, exportPixelCrushers } from "../src/index.js";

const openProjects: ReedProject[] = [];
afterEach(() => { while (openProjects.length > 0) openProjects.pop()?.close(); });

interface Field { title: string; value: string; type: number; typeString: string }

describe("Pixel Crushers Unity import shape", () => {
  it("types variables, localized fields, and voice-over entry tags for the Dialogue System", async () => {
    const root = await mkdtemp(path.join(os.tmpdir(), "reed-pc-"));
    const project = await ReedProject.create(root, { name: "Harbour", slug: "harbour", languages: ["en", "el"], defaultLanguage: "en" });
    openProjects.push(project);
    await project.declareVariable({ name: "HasKey", type: "boolean", initialValue: true });
    await project.declareVariable({ name: "Gold", type: "number", initialValue: 5 });
    await project.declareVariable({ name: "Mood", type: "text", initialValue: "calm" });
    const scene = (await project.createScene({ name: "Dock", slug: "dock" })).value;
    const conversation = (await project.createConversation({ sceneId: scene.id, title: "Hello" })).value;
    const line = (await project.addNode({ conversationId: conversation.id, text: "Hi", isTerminal: true })).value;
    await project.setNodeText({ lineId: line.lineId, language: "el", text: "Γεια", menuText: "Γεια;" });

    const exported = await exportPixelCrushers(project, { allowInvalid: true });
    const database = JSON.parse(await readFile(exported.outputs[0]?.filePath ?? "", "utf8")) as {
      variables: Array<{ fields: Field[] }>;
      conversations: Array<{ dialogueEntries: Array<{ id: number; fields: Field[] }> }>;
    };
    const initial = (name: string) => database.variables.find((variable) => variable.fields.some((entry) => entry.title === "Name" && entry.value === name))
      ?.fields.find((entry) => entry.title === "Initial Value");
    expect(initial("HasKey")).toMatchObject({ value: "True", typeString: "CustomFieldType_Boolean" });
    expect(initial("Gold")).toMatchObject({ value: "5", typeString: "CustomFieldType_Number" });
    expect(initial("Mood")).toMatchObject({ value: "calm", typeString: "CustomFieldType_Text" });
    expect(database.variables.flatMap((variable) => variable.fields).some((entry) => entry.title === "Type")).toBe(false);

    const fields = database.conversations[0]?.dialogueEntries.find((entry) => entry.id === line.entryNumericId)?.fields ?? [];
    expect(fields).toContainEqual(expect.objectContaining({ title: "VoiceOverFile", value: line.lineId }));
    expect(fields).toContainEqual(expect.objectContaining({ title: "Dialogue Text", value: "Hi", typeString: "CustomFieldType_Text" }));
    expect(fields).toContainEqual(expect.objectContaining({ title: "el", value: "Γεια", typeString: "CustomFieldType_Localization" }));
    expect(fields).toContainEqual(expect.objectContaining({ title: "Menu Text el", typeString: "CustomFieldType_Localization" }));

    const manifest = JSON.parse(await readFile(exported.manifestPath, "utf8")) as { entrytagFormat: string; audio: Array<{ lineId: string; entrytag: string }> };
    expect(manifest.entrytagFormat).toBe("VoiceOverFile");
    expect(manifest.audio).toContainEqual(expect.objectContaining({ lineId: line.lineId, entrytag: line.lineId }));
  });
});
