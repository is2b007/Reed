import path from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import { ConflictError } from "./errors.js";
import type { DialogueNodeRecord } from "./models.js";
import type { ReedProject } from "./project.js";
import { validateProject } from "./validation.js";

export interface PixelCrushersField {
  title: string;
  value: string;
  type: number;
  typeString: string;
}

export interface PixelCrushersExportOptions {
  mode?: "single" | "partitioned";
  outputDirectory?: string;
  databaseName?: string;
  dialogueTextFieldNames?: Record<string, string>;
  menuTextFieldNames?: Record<string, string>;
  allowInvalid?: boolean;
}

const TYPE = {
  text: [0, "CustomFieldType_Text"],
  number: [1, "CustomFieldType_Number"],
  boolean: [2, "CustomFieldType_Boolean"],
  localization: [4, "CustomFieldType_Localization"],
  actor: [5, "CustomFieldType_Actor"],
} as const;

function field(title: string, value: string | number | boolean, kind: keyof typeof TYPE = "text"): PixelCrushersField {
  const [type, typeString] = TYPE[kind];
  return { title, value: typeof value === "boolean" ? (value ? "True" : "False") : String(value), type, typeString };
}

function nodeFields(node: DialogueNodeRecord, languages: string[], defaultLanguage: string, options: PixelCrushersExportOptions): PixelCrushersField[] {
  const texts = new Map(node.texts.map((entry) => [entry.language, entry]));
  const fields: PixelCrushersField[] = [
    field("Title", node.kind === "start" ? "START" : node.lineId),
    field("Actor", node.speakerCharacterId ? node.speakerCharacterId : 0, "actor"),
    field("Conversant", node.listenerCharacterId ? node.listenerCharacterId : 0, "actor"),
    field("Sequence", node.sequence),
    field("Line ID", node.lineId),
    field("Is Group", node.kind === "group", "boolean"),
    field("Spoken Language", node.spokenLanguage),
    field("Subtitle Override", node.subtitleOverride),
    field("Context Comment", node.contextComment),
    field("Voice Comment", node.voiceComment),
    field("Pronunciation", node.pronunciation),
    field("Line Status", node.lineStatus),
    field("Voice Status", node.voiceStatus),
    field("Tags", node.tags.join(",")),
  ];
  // Dialogue System's "VoiceOverFile" entrytag format resolves audio by this field, so `AudioWait(entrytag)`
  // finds the `{LineID}.wav` files named in the voice package.
  if (node.kind === "line" || node.kind === "choice") fields.push(field("VoiceOverFile", node.lineId));
  for (const language of languages) {
    const value = texts.get(language);
    const dialogueTitle = options.dialogueTextFieldNames?.[language] ?? (language === defaultLanguage ? "Dialogue Text" : language);
    const menuTitle = options.menuTextFieldNames?.[language] ?? (language === defaultLanguage ? "Menu Text" : `Menu Text ${language}`);
    const kind = language === defaultLanguage ? "text" : "localization";
    fields.push(field(dialogueTitle, value?.text ?? "", kind));
    if (value?.menuText) fields.push(field(menuTitle, value.menuText, kind));
  }
  return fields;
}

function variableInitialValue(type: string, value: boolean | number | string): PixelCrushersField {
  if (type === "boolean") return field("Initial Value", value === true || String(value).toLowerCase() === "true", "boolean");
  if (type === "number") {
    const numeric = typeof value === "number" ? value : Number(value);
    return field("Initial Value", Number.isFinite(numeric) ? numeric : 0, "number");
  }
  return field("Initial Value", String(value));
}

function fileSlug(value: string): string {
  return value.normalize("NFKC").toLowerCase().replace(/[^\p{L}\p{N}._-]+/gu, "-").replace(/^[-.]+|-+$/gu, "") || "dialogue";
}

function actorNumericMap(reed: ReedProject): Map<string, number> {
  return new Map(reed.listCharacters().map((character) => [character.id, character.numericId]));
}

function buildDatabase(reed: ReedProject, conversationIds: Set<string>, name: string, options: PixelCrushersExportOptions) {
  const project = reed.getProject();
  const actorIds = actorNumericMap(reed);
  const allGraphs = reed.listConversations().map((conversation) => reed.getConversation(conversation.id));
  const numericByConversation = new Map(allGraphs.map((conversation) => [conversation.id, conversation.numericId]));
  return {
    version: "1.0.0",
    name,
    description: `GENERATED — DO NOT HAND-EDIT — Reed schema ${project.schemaVersion}`,
    author: "Reed",
    actors: reed.listCharacters().map((character) => ({
      id: character.numericId,
      fields: [
        field("Name", character.name), field("Is Player", character.isPlayer, "boolean"),
        field("Description", character.description), field("Portrait", character.portraitPath ?? ""),
        ...Object.entries(character.displayNames).sort(([a], [b]) => a.localeCompare(b)).map(([language, value]) => field(`Display Name ${language}`, value)),
      ],
    })),
    items: [],
    locations: [],
    variables: reed.listVariables().map((variable) => ({
      id: variable.numericId,
      // Dialogue System derives a variable's runtime type from the Initial Value field type.
      fields: [field("Name", variable.name), variableInitialValue(variable.type, variable.initialValue), field("Description", variable.description)],
    })),
    conversations: allGraphs.filter((conversation) => conversationIds.has(conversation.id)).map((conversation) => ({
      id: conversation.numericId,
      fields: [field("Title", conversation.title), field("Description", conversation.description)],
      dialogueEntries: conversation.nodes.map((node) => ({
        id: node.entryNumericId,
        conversationID: conversation.numericId,
        isRoot: node.kind === "start",
        isGroup: node.kind === "group",
        canvasRect: { x: node.x, y: node.y, width: 300, height: 150 },
        fields: nodeFields({
          ...node,
          speakerCharacterId: node.speakerCharacterId ? String(actorIds.get(node.speakerCharacterId) ?? 0) : null,
          listenerCharacterId: node.listenerCharacterId ? String(actorIds.get(node.listenerCharacterId) ?? 0) : null,
        }, project.languages, project.defaultLanguage, options),
        conditionsString: node.conditions,
        userScript: node.userScript,
        outgoingLinks: conversation.links.filter((link) => link.originNodeId === node.id).map((link) => {
          const destination = allGraphs.find((graph) => graph.id === link.destinationConversationId)?.nodes.find((candidate) => candidate.id === link.destinationNodeId);
          return {
            originConversationID: conversation.numericId,
            originDialogueID: node.entryNumericId,
            destinationConversationID: numericByConversation.get(link.destinationConversationId) ?? 0,
            destinationDialogueID: destination?.entryNumericId ?? 0,
            isConnector: link.destinationConversationId !== conversation.id,
            priority: link.priority,
          };
        }),
      })),
    })),
  };
}

async function atomicJson(target: string, value: unknown): Promise<void> {
  await atomicWriteFile(target, `${JSON.stringify(value, null, 2)}\n`);
}

export async function exportPixelCrushers(reed: ReedProject, options: PixelCrushersExportOptions = {}) {
  const report = validateProject(reed);
  if (!report.valid && !options.allowInvalid) throw new ConflictError("Pixel Crushers export blocked by validation errors", { report });
  const outputDirectory = path.resolve(options.outputDirectory ?? path.join(reed.paths.exports, "pixel-crushers"));
  const project = reed.getProject();
  const conversations = reed.listConversations();
  const outputs: Array<{ partitionId: string | null; filePath: string; conversationIds: string[] }> = [];
  if ((options.mode ?? "single") === "single") {
    const ids = conversations.map((conversation) => conversation.id).sort();
    const filePath = path.join(outputDirectory, `${fileSlug(options.databaseName ?? project.slug)}.json`);
    await atomicJson(filePath, buildDatabase(reed, new Set(ids), options.databaseName ?? project.name, options));
    outputs.push({ partitionId: null, filePath, conversationIds: ids });
  } else {
    for (const partition of reed.listPartitions()) {
      const ids = conversations.filter((conversation) => conversation.partitionId === partition.id).map((conversation) => conversation.id).sort();
      if (ids.length === 0) continue;
      const filePath = path.join(outputDirectory, `${fileSlug(project.slug)}-${partition.baseId}-${fileSlug(partition.name)}.json`);
      await atomicJson(filePath, buildDatabase(reed, new Set(ids), `${project.name} — ${partition.name}`, options));
      outputs.push({ partitionId: partition.id, filePath, conversationIds: ids });
    }
  }
  const manifest = {
    generatedBy: "Reed",
    schemaVersion: project.schemaVersion,
    entrytagFormat: "VoiceOverFile",
    databases: outputs,
    audio: conversations.flatMap((conversation) => reed.getConversation(conversation.id).nodes)
      .filter((node) => node.kind !== "start" && node.kind !== "group")
      .sort((a, b) => a.lineId.localeCompare(b.lineId))
      .map((node) => {
        const conversation = conversations.find((candidate) => candidate.id === node.conversationId);
        return { lineId: node.lineId, file: `${node.lineId}.wav`, entrytag: node.lineId, conversationId: conversation?.numericId ?? 0, entryId: node.entryNumericId };
      }),
  };
  const manifestPath = path.join(outputDirectory, "reed-pixelcrushers-manifest.json");
  await atomicJson(manifestPath, manifest);
  return { outputs, manifestPath, validation: report };
}
