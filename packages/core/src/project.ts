import { mkdir, readdir, unlink } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import Database from "better-sqlite3";
import {
  AddNodeInputSchema,
  CreateConversationInputSchema,
  CreateLevelInputSchema,
  CreateProjectInputSchema,
  CreateSceneInputSchema,
  DeclareVariableInputSchema,
  LinkNodesInputSchema,
  SCHEMA_VERSION,
  SetLineStatusInputSchema,
  SetVoiceStatusInputSchema,
  SetNodeTextInputSchema,
  UpsertCharacterInputSchema,
  type AddNodeInput,
  type CreateConversationInput,
  type CreateLevelInput,
  type CreateProjectInput,
  type CreateSceneInput,
  type DeclareVariableInput,
  type LinkNodesInput,
  type MutationRecord,
  type MutationSource,
  type SetLineStatusInput,
  type SetVoiceStatusInput,
  type SetNodeTextInput,
  type UpsertCharacterInput,
} from "@reed/schema";
import { ConflictError, ConcurrencyError, GuardrailError, NotFoundError } from "./errors.js";
import { runMigrations } from "./migrations.js";
import type {
  BackupRecord,
  CharacterRecord,
  ConversationGraph,
  ConversationRecord,
  DialogueLinkRecord,
  DialogueNodeRecord,
  LevelRecord,
  MutationResult,
  NodeTextRecord,
  ProjectRecord,
  SceneRecord,
  SearchResult,
  VariableRecord,
} from "./models.js";
import { resolveProjectPaths, type ReedProjectPaths } from "./paths.js";

const ROLLING_BACKUP_INTERVAL_MS = 5 * 60 * 1_000;
const ROLLING_BACKUP_LIMIT = 30;
const DEFAULT_PARTITION_SIZE = 1_000_000;

type Row = Record<string, unknown>;

function now(): string {
  return new Date().toISOString();
}

function parseJson<T>(value: unknown): T {
  return JSON.parse(String(value)) as T;
}

function boolean(value: unknown): boolean {
  return Number(value) === 1;
}

function slugPrefix(slug: string): string {
  return slug.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function safeFilePart(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "snapshot";
}

function mapProject(row: Row): ProjectRecord {
  return {
    id: String(row.id),
    name: String(row.name),
    slug: String(row.slug),
    schemaVersion: Number(row.schema_version),
    languages: parseJson<string[]>(row.languages_json),
    defaultLanguage: String(row.default_language),
    version: Number(row.version),
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

function mapLevel(row: Row): LevelRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), name: String(row.name),
    sortOrder: Number(row.sort_order), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapScene(row: Row): SceneRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), levelId: row.level_id ? String(row.level_id) : null,
    partitionId: String(row.partition_id), name: String(row.name), slug: String(row.slug),
    lineIdPrefix: String(row.line_id_prefix), beatRef: String(row.beat_ref), sortOrder: Number(row.sort_order),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapConversation(row: Row): ConversationRecord {
  return {
    id: String(row.id), projectId: String(row.project_id), sceneId: String(row.scene_id),
    partitionId: String(row.partition_id), title: String(row.title), description: String(row.description),
    numericId: Number(row.numeric_id), version: Number(row.version),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapNodeText(row: Row): NodeTextRecord {
  return {
    language: String(row.language_code), text: String(row.dialogue_text),
    menuText: row.menu_text === null ? null : String(row.menu_text),
    verificationStatus: String(row.verification_status) as NodeTextRecord["verificationStatus"],
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

function mapNode(row: Row, texts: NodeTextRecord[]): DialogueNodeRecord {
  return {
    id: String(row.id), conversationId: String(row.conversation_id), lineId: String(row.line_id),
    entryNumericId: Number(row.entry_numeric_id), kind: String(row.kind) as DialogueNodeRecord["kind"],
    speakerCharacterId: row.speaker_character_id ? String(row.speaker_character_id) : null,
    listenerCharacterId: row.listener_character_id ? String(row.listener_character_id) : null,
    spokenLanguage: String(row.spoken_language), sequence: String(row.sequence), conditions: String(row.conditions),
    userScript: String(row.user_script), subtitleOverride: String(row.subtitle_override) as DialogueNodeRecord["subtitleOverride"],
    contextComment: String(row.context_comment), voiceComment: String(row.voice_comment),
    contextPath: parseJson<string[]>(row.context_path_json),
    lineStatus: String(row.line_status) as DialogueNodeRecord["lineStatus"],
    voiceStatus: String(row.voice_status) as DialogueNodeRecord["voiceStatus"],
    tags: parseJson<string[]>(row.tags_json), isTerminal: boolean(row.is_terminal),
    x: Number(row.x), y: Number(row.y), createdAt: String(row.created_at), updatedAt: String(row.updated_at), texts,
  };
}

function mapLink(row: Row): DialogueLinkRecord {
  return {
    id: String(row.id), originConversationId: String(row.origin_conversation_id),
    originNodeId: String(row.origin_node_id), destinationConversationId: String(row.destination_conversation_id),
    destinationNodeId: String(row.destination_node_id), priority: Number(row.priority),
    createdAt: String(row.created_at), updatedAt: String(row.updated_at),
  };
}

export class ReedProject {
  readonly paths: ReedProjectPaths;

  private constructor(readonly db: Database.Database, projectRoot: string) {
    this.paths = resolveProjectPaths(projectRoot);
  }

  static async create(projectRoot: string, rawInput: CreateProjectInput): Promise<ReedProject> {
    const input = CreateProjectInputSchema.parse(rawInput);
    const paths = resolveProjectPaths(projectRoot);
    if (existsSync(paths.database)) throw new ConflictError("A Reed project already exists in this folder", { projectRoot: paths.root });
    await Promise.all([mkdir(paths.reedDir, { recursive: true }), mkdir(paths.backups, { recursive: true }), mkdir(paths.exports, { recursive: true })]);
    const db = new Database(paths.database, { timeout: 5_000 });
    try {
      ReedProject.configure(db);
      runMigrations(db);
      const timestamp = now();
      const projectId = randomUUID();
      const partitionId = randomUUID();
      db.transaction(() => {
        db.prepare(`INSERT INTO projects
          (id, name, slug, schema_version, languages_json, default_language, version, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(
          projectId, input.name, input.slug, SCHEMA_VERSION, JSON.stringify(input.languages), input.defaultLanguage, timestamp, timestamp,
        );
        db.prepare(`INSERT INTO database_partitions
          (id, project_id, name, scope_type, scope_id, base_id, range_size, export_order, created_at, updated_at)
          VALUES (?, ?, 'Main', 'project', ?, 0, ?, 0, ?, ?)`).run(
          partitionId, projectId, projectId, DEFAULT_PARTITION_SIZE, timestamp, timestamp,
        );
      }).immediate();
      return new ReedProject(db, paths.root);
    } catch (error) {
      db.close();
      throw error;
    }
  }

  static async open(projectRoot: string): Promise<ReedProject> {
    const paths = resolveProjectPaths(projectRoot);
    if (!existsSync(paths.database)) throw new NotFoundError("Reed project", paths.root);
    await Promise.all([mkdir(paths.backups, { recursive: true }), mkdir(paths.exports, { recursive: true })]);
    const db = new Database(paths.database, { timeout: 5_000 });
    ReedProject.configure(db);
    runMigrations(db);
    return new ReedProject(db, paths.root);
  }

  private static configure(db: Database.Database): void {
    db.pragma("foreign_keys = ON");
    db.pragma("journal_mode = WAL");
    db.pragma("synchronous = FULL");
    db.pragma("wal_autocheckpoint = 1000");
  }

  close(): void {
    if (this.db.open) this.db.close();
  }

  getProject(): ProjectRecord {
    const row = this.db.prepare("SELECT * FROM projects LIMIT 1").get() as Row | undefined;
    if (!row) throw new NotFoundError("Project", this.paths.root);
    return mapProject(row);
  }

  listLevels(): LevelRecord[] {
    return (this.db.prepare("SELECT * FROM levels ORDER BY sort_order, name, id").all() as Row[]).map(mapLevel);
  }

  listScenes(): SceneRecord[] {
    return (this.db.prepare("SELECT * FROM scenes ORDER BY sort_order, name, id").all() as Row[]).map(mapScene);
  }

  listCharacters(): CharacterRecord[] {
    return (this.db.prepare("SELECT * FROM characters ORDER BY name, id").all() as Row[]).map((row) => ({
      id: String(row.id), projectId: String(row.project_id), name: String(row.name),
      displayNames: parseJson<Record<string, string>>(row.display_names_json), isPlayer: boolean(row.is_player),
      portraitPath: row.portrait_path === null ? null : String(row.portrait_path), description: String(row.description),
      actorNotes: String(row.actor_notes), voiceNotes: String(row.voice_notes),
      createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }

  listVariables(): VariableRecord[] {
    return (this.db.prepare("SELECT * FROM variables ORDER BY name, id").all() as Row[]).map((row) => ({
      id: String(row.id), projectId: String(row.project_id), name: String(row.name),
      type: String(row.type) as VariableRecord["type"], initialValue: parseJson<boolean | number | string>(row.initial_value_json),
      description: String(row.description), createdAt: String(row.created_at), updatedAt: String(row.updated_at),
    }));
  }

  listConversations(): ConversationRecord[] {
    return (this.db.prepare("SELECT * FROM conversations ORDER BY numeric_id, title, id").all() as Row[]).map(mapConversation);
  }

  getConversation(id: string): ConversationGraph {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new NotFoundError("Conversation", id);
    const conversation = mapConversation(row);
    const textRows = this.db.prepare(`SELECT nt.* FROM node_texts nt
      JOIN dialogue_nodes dn ON dn.id = nt.node_id WHERE dn.conversation_id = ?
      ORDER BY nt.node_id, nt.language_code`).all(id) as Array<Row & { node_id: string }>;
    const texts = new Map<string, NodeTextRecord[]>();
    for (const textRow of textRows) {
      const nodeId = String(textRow.node_id);
      const values = texts.get(nodeId) ?? [];
      values.push(mapNodeText(textRow));
      texts.set(nodeId, values);
    }
    const nodes = (this.db.prepare("SELECT * FROM dialogue_nodes WHERE conversation_id = ? ORDER BY entry_numeric_id, id").all(id) as Row[])
      .map((node) => mapNode(node, texts.get(String(node.id)) ?? []));
    const links = (this.db.prepare("SELECT * FROM dialogue_links WHERE origin_conversation_id = ? ORDER BY priority, id").all(id) as Row[]).map(mapLink);
    return { ...conversation, nodes, links };
  }

  getChanges(afterSequence = 0): MutationRecord[] {
    return (this.db.prepare("SELECT * FROM mutation_log WHERE sequence > ? ORDER BY sequence").all(afterSequence) as Row[]).map((row) => this.mapMutation(row));
  }

  find(query: string, limit = 50): SearchResult[] {
    const rows = this.db.prepare(`SELECT ls.line_id, ls.language_code, ls.dialogue_text, ls.menu_text,
      c.id AS conversation_id, c.title AS conversation_title, s.id AS scene_id, s.name AS scene_name
      FROM line_search ls
      JOIN dialogue_nodes dn ON dn.line_id = ls.line_id
      JOIN conversations c ON c.id = dn.conversation_id
      JOIN scenes s ON s.id = c.scene_id
      WHERE line_search MATCH ? ORDER BY rank, ls.line_id, ls.language_code LIMIT ?`).all(query, limit) as Row[];
    return rows.map((row) => ({
      lineId: String(row.line_id), language: String(row.language_code), text: String(row.dialogue_text),
      menuText: row.menu_text === null ? null : String(row.menu_text), conversationId: String(row.conversation_id),
      conversationTitle: String(row.conversation_title), sceneId: String(row.scene_id), sceneName: String(row.scene_name),
    }));
  }

  async createLevel(rawInput: CreateLevelInput): Promise<MutationResult<LevelRecord>> {
    const input = CreateLevelInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const project = this.getProject();
    this.assertVersion("project", project.id, input.expectedVersion, project.version);
    const id = randomUUID();
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare("INSERT INTO levels(id, project_id, name, sort_order, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .run(id, project.id, input.name, input.sortOrder, timestamp, timestamp);
      return this.commitProjectMutation(project, "level.create", input.source, { id, name: input.name });
    }).immediate();
    return { value: mapLevel(this.db.prepare("SELECT * FROM levels WHERE id = ?").get(id) as Row), ...result };
  }

  async createScene(rawInput: CreateSceneInput): Promise<MutationResult<SceneRecord>> {
    const input = CreateSceneInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const project = this.getProject();
    this.assertVersion("project", project.id, input.expectedVersion, project.version);
    if (input.levelId && !this.db.prepare("SELECT 1 FROM levels WHERE id = ? AND project_id = ?").get(input.levelId, project.id)) {
      throw new NotFoundError("Level", input.levelId);
    }
    const partition = this.db.prepare("SELECT id FROM database_partitions WHERE project_id = ? ORDER BY export_order, base_id LIMIT 1").get(project.id) as Row;
    const prefix = slugPrefix(input.slug);
    const id = randomUUID();
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO scenes
        (id, project_id, level_id, partition_id, name, slug, line_id_prefix, beat_ref, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, project.id, input.levelId ?? null, partition.id, input.name, input.slug, prefix, input.beatRef, input.sortOrder, timestamp, timestamp,
      );
      return this.commitProjectMutation(project, "scene.create", input.source, { id, name: input.name, lineIdPrefix: prefix });
    }).immediate();
    return { value: mapScene(this.db.prepare("SELECT * FROM scenes WHERE id = ?").get(id) as Row), ...result };
  }

  async createConversation(rawInput: CreateConversationInput): Promise<MutationResult<ConversationGraph>> {
    const input = CreateConversationInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const project = this.getProject();
    this.assertVersion("project", project.id, input.expectedVersion, project.version);
    const scene = this.db.prepare("SELECT * FROM scenes WHERE id = ? AND project_id = ?").get(input.sceneId, project.id) as Row | undefined;
    if (!scene) throw new NotFoundError("Scene", input.sceneId);
    const partition = this.db.prepare("SELECT base_id, range_size FROM database_partitions WHERE id = ?").get(scene.partition_id) as Row;
    const max = this.db.prepare("SELECT MAX(numeric_id) AS value FROM conversations WHERE partition_id = ?").get(scene.partition_id) as Row;
    const numericId = Math.max(Number(partition.base_id), Number(max.value ?? partition.base_id)) + 1;
    if (numericId >= Number(partition.base_id) + Number(partition.range_size)) throw new ConflictError("The database partition ID range is exhausted");
    const id = randomUUID();
    const startId = randomUUID();
    const startLineId = this.allocateLineId(String(scene.line_id_prefix));
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO conversations
        (id, project_id, scene_id, partition_id, title, description, numeric_id, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?)`).run(
        id, project.id, input.sceneId, scene.partition_id, input.title, input.description, numericId, timestamp, timestamp,
      );
      this.db.prepare(`INSERT INTO dialogue_nodes
        (id, conversation_id, line_id, entry_numeric_id, kind, spoken_language, line_status, created_at, updated_at)
        VALUES (?, ?, ?, 0, 'start', ?, 'final', ?, ?)`).run(startId, id, startLineId, project.defaultLanguage, timestamp, timestamp);
      return this.commitProjectMutation(project, "conversation.create", input.source, { id, sceneId: input.sceneId, numericId, startNodeId: startId });
    }).immediate();
    return { value: this.getConversation(id), ...result };
  }

  async addNode(rawInput: AddNodeInput): Promise<MutationResult<DialogueNodeRecord>> {
    const input = AddNodeInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const conversation = this.requireConversation(input.conversationId);
    this.assertVersion("conversation", conversation.id, input.expectedVersion, conversation.version);
    this.assertCharacter(input.speakerCharacterId);
    this.assertCharacter(input.listenerCharacterId);
    const project = this.getProject();
    const scene = this.db.prepare("SELECT line_id_prefix FROM scenes WHERE id = ?").get(conversation.sceneId) as Row;
    const next = this.db.prepare("SELECT COALESCE(MAX(entry_numeric_id), 0) + 1 AS value FROM dialogue_nodes WHERE conversation_id = ?").get(conversation.id) as Row;
    const id = randomUUID();
    const lineId = this.allocateLineId(String(scene.line_id_prefix));
    const timestamp = now();
    const spokenLanguage = input.spokenLanguage ?? project.defaultLanguage;
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO dialogue_nodes
        (id, conversation_id, line_id, entry_numeric_id, kind, speaker_character_id, listener_character_id,
         spoken_language, is_terminal, x, y, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, conversation.id, lineId, next.value, input.kind, input.speakerCharacterId ?? null,
        input.listenerCharacterId ?? null, spokenLanguage, input.isTerminal ? 1 : 0, input.x, input.y, timestamp, timestamp,
      );
      if (input.text !== undefined || input.menuText !== undefined) {
        this.db.prepare(`INSERT INTO node_texts
          (node_id, language_code, dialogue_text, menu_text, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)`)
          .run(id, spokenLanguage, input.text ?? "", input.menuText ?? null, timestamp, timestamp);
        this.refreshSearch(lineId, spokenLanguage, input.text ?? "", input.menuText ?? null);
      }
      return this.commitConversationMutation(conversation, "node.create", input.source, { id, lineId, entryNumericId: Number(next.value), kind: input.kind });
    }).immediate();
    return { value: this.getNodeByLineId(lineId), ...result };
  }

  async linkNodes(rawInput: LinkNodesInput): Promise<MutationResult<DialogueLinkRecord>> {
    const input = LinkNodesInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const origin = this.requireNode(input.originNodeId);
    const destination = this.requireNode(input.destinationNodeId);
    const conversation = this.requireConversation(String(origin.conversation_id));
    this.assertVersion("conversation", conversation.id, input.expectedVersion, conversation.version);
    const touchesFinal = (origin.kind !== "start" && origin.line_status === "final")
      || (destination.kind !== "start" && destination.line_status === "final");
    if (touchesFinal && !input.force) {
      throw new GuardrailError("Linking final content requires force", { originNodeId: input.originNodeId, destinationNodeId: input.destinationNodeId });
    }
    if (input.source === "agent" && touchesFinal) {
      throw new GuardrailError("Agents cannot reconnect final content");
    }
    const id = randomUUID();
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO dialogue_links
        (id, origin_conversation_id, origin_node_id, destination_conversation_id, destination_node_id, priority, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(
        id, origin.conversation_id, input.originNodeId, destination.conversation_id, input.destinationNodeId, input.priority, timestamp, timestamp,
      );
      return this.commitConversationMutation(conversation, "link.create", input.source, {
        id, originNodeId: input.originNodeId, destinationNodeId: input.destinationNodeId,
      });
    }).immediate();
    return { value: mapLink(this.db.prepare("SELECT * FROM dialogue_links WHERE id = ?").get(id) as Row), ...result };
  }

  async setNodeText(rawInput: SetNodeTextInput): Promise<MutationResult<DialogueNodeRecord>> {
    const input = SetNodeTextInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const node = this.requireNodeByLineId(input.lineId);
    const conversation = this.requireConversation(String(node.conversation_id));
    this.assertVersion("conversation", conversation.id, input.expectedVersion, conversation.version);
    const project = this.getProject();
    if (!project.languages.includes(input.language)) throw new ConflictError("Language is not enabled for this project", { language: input.language });
    if (node.line_status === "final" && !input.force) throw new GuardrailError("Editing final text requires force", { lineId: input.lineId });
    if (node.line_status === "final" && input.source === "agent") throw new GuardrailError("Agents cannot edit final text", { lineId: input.lineId });
    const existing = this.db.prepare("SELECT * FROM node_texts WHERE node_id = ? AND language_code = ?").get(node.id, input.language) as Row | undefined;
    const timestamp = now();
    const menuText = input.menuText === undefined ? (existing?.menu_text ?? null) : input.menuText;
    const verification = input.verificationStatus ?? existing?.verification_status ?? "unverified";
    const voiceNeedsRework = ["recorded", "processed", "final"].includes(String(node.voice_status)) && String(existing?.dialogue_text ?? "") !== input.text;
    const lineNeedsRework = node.line_status === "final" && String(existing?.dialogue_text ?? "") !== input.text;
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO node_texts
        (node_id, language_code, dialogue_text, menu_text, verification_status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(node_id, language_code) DO UPDATE SET
          dialogue_text = excluded.dialogue_text, menu_text = excluded.menu_text,
          verification_status = excluded.verification_status, updated_at = excluded.updated_at`).run(
        node.id, input.language, input.text, menuText, verification, existing?.created_at ?? timestamp, timestamp,
      );
      this.db.prepare(`UPDATE dialogue_nodes SET voice_status = CASE WHEN ? THEN 'rework' ELSE voice_status END,
        line_status = CASE WHEN ? THEN 'rework' ELSE line_status END, updated_at = ? WHERE id = ?`)
        .run(voiceNeedsRework ? 1 : 0, lineNeedsRework ? 1 : 0, timestamp, node.id);
      this.refreshSearch(input.lineId, input.language, input.text, menuText === null ? null : String(menuText));
      return this.commitConversationMutation(conversation, "text.set", input.source, {
        lineId: input.lineId, language: input.language, before: existing ? { text: existing.dialogue_text, menuText: existing.menu_text } : null,
        after: { text: input.text, menuText }, voiceNeedsRework, lineNeedsRework,
      });
    }).immediate();
    return { value: this.getNodeByLineId(input.lineId), ...result };
  }

  async setLineStatus(rawInput: SetLineStatusInput): Promise<MutationResult<DialogueNodeRecord>> {
    const input = SetLineStatusInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const node = this.requireNodeByLineId(input.lineId);
    const conversation = this.requireConversation(String(node.conversation_id));
    this.assertVersion("conversation", conversation.id, input.expectedVersion, conversation.version);
    if (input.source === "agent" && ["edited", "final"].includes(input.status)) {
      throw new GuardrailError("Agents cannot set a line above polished", { requestedStatus: input.status });
    }
    if (input.status === "final" && !input.force) throw new GuardrailError("Setting final status requires force", { lineId: input.lineId });
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare("UPDATE dialogue_nodes SET line_status = ?, updated_at = ? WHERE id = ?").run(input.status, timestamp, node.id);
      return this.commitConversationMutation(conversation, "line.status", input.source, { lineId: input.lineId, before: node.line_status, after: input.status });
    }).immediate();
    return { value: this.getNodeByLineId(input.lineId), ...result };
  }

  async setVoiceStatus(rawInput: SetVoiceStatusInput): Promise<MutationResult<DialogueNodeRecord>> {
    const input = SetVoiceStatusInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const node = this.requireNodeByLineId(input.lineId);
    const conversation = this.requireConversation(String(node.conversation_id));
    this.assertVersion("conversation", conversation.id, input.expectedVersion, conversation.version);
    if (input.source === "agent" && input.status === "final") throw new GuardrailError("Agents cannot finalize recorded voice");
    if (input.status === "final" && !input.force) throw new GuardrailError("Setting final voice status requires force", { lineId: input.lineId });
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare("UPDATE dialogue_nodes SET voice_status = ?, updated_at = ? WHERE id = ?").run(input.status, timestamp, node.id);
      return this.commitConversationMutation(conversation, "voice.status", input.source, { lineId: input.lineId, before: node.voice_status, after: input.status });
    }).immediate();
    return { value: this.getNodeByLineId(input.lineId), ...result };
  }

  async upsertCharacter(rawInput: UpsertCharacterInput): Promise<MutationResult<CharacterRecord>> {
    const input = UpsertCharacterInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const project = this.getProject();
    this.assertVersion("project", project.id, input.expectedVersion, project.version);
    const id = input.id ?? randomUUID();
    const existing = this.db.prepare("SELECT * FROM characters WHERE id = ?").get(id) as Row | undefined;
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO characters
        (id, project_id, name, display_names_json, is_player, portrait_path, description, actor_notes, voice_notes, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET name = excluded.name, display_names_json = excluded.display_names_json,
          is_player = excluded.is_player, portrait_path = excluded.portrait_path, description = excluded.description,
          actor_notes = excluded.actor_notes, voice_notes = excluded.voice_notes, updated_at = excluded.updated_at`).run(
        id, project.id, input.name, JSON.stringify(input.displayNames), input.isPlayer ? 1 : 0, input.portraitPath,
        input.description, input.actorNotes, input.voiceNotes, existing?.created_at ?? timestamp, timestamp,
      );
      return this.commitProjectMutation(project, existing ? "character.update" : "character.create", input.source, { id, name: input.name });
    }).immediate();
    const value = this.listCharacters().find((character) => character.id === id);
    if (!value) throw new NotFoundError("Character", id);
    return { value, ...result };
  }

  async declareVariable(rawInput: DeclareVariableInput): Promise<MutationResult<VariableRecord>> {
    const input = DeclareVariableInputSchema.parse(rawInput);
    await this.ensureRollingBackup();
    const project = this.getProject();
    this.assertVersion("project", project.id, input.expectedVersion, project.version);
    const correctType = (input.type === "boolean" && typeof input.initialValue === "boolean")
      || (input.type === "number" && typeof input.initialValue === "number")
      || (input.type === "text" && typeof input.initialValue === "string");
    if (!correctType) throw new ConflictError("Variable initial value does not match its declared type", { name: input.name, type: input.type });
    const existing = this.db.prepare("SELECT id, created_at FROM variables WHERE project_id = ? AND name = ?").get(project.id, input.name) as Row | undefined;
    const id = existing ? String(existing.id) : randomUUID();
    const timestamp = now();
    const result = this.db.transaction(() => {
      this.db.prepare(`INSERT INTO variables
        (id, project_id, name, type, initial_value_json, description, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(project_id, name) DO UPDATE SET type = excluded.type, initial_value_json = excluded.initial_value_json,
          description = excluded.description, updated_at = excluded.updated_at`).run(
        id, project.id, input.name, input.type, JSON.stringify(input.initialValue), input.description, existing?.created_at ?? timestamp, timestamp,
      );
      return this.commitProjectMutation(project, existing ? "variable.update" : "variable.create", input.source, { id, name: input.name, type: input.type });
    }).immediate();
    const value = this.listVariables().find((variable) => variable.id === id);
    if (!value) throw new NotFoundError("Variable", id);
    return { value, ...result };
  }

  async createBackup(kind: "rolling" | "named", label: string | null = null): Promise<BackupRecord> {
    const project = this.getProject();
    await mkdir(this.paths.backups, { recursive: true });
    const timestamp = now();
    const stamp = timestamp.replace(/[:.]/g, "-");
    const filename = `${stamp}-${kind}${label ? `-${safeFilePart(label)}` : ""}.sqlite`;
    const filePath = path.join(this.paths.backups, filename);
    await this.db.backup(filePath);
    const record: BackupRecord = { id: randomUUID(), projectId: project.id, kind, label, filePath, createdAt: timestamp };
    this.db.prepare("INSERT INTO backup_records(id, project_id, kind, label, file_path, created_at) VALUES (?, ?, ?, ?, ?, ?)")
      .run(record.id, record.projectId, record.kind, record.label, record.filePath, record.createdAt);
    if (kind === "rolling") await this.pruneRollingBackups();
    return record;
  }

  listBackups(): BackupRecord[] {
    return (this.db.prepare("SELECT * FROM backup_records ORDER BY created_at DESC, id DESC").all() as Row[]).map((row) => ({
      id: String(row.id), projectId: String(row.project_id), kind: String(row.kind) as BackupRecord["kind"],
      label: row.label === null ? null : String(row.label), filePath: String(row.file_path), createdAt: String(row.created_at),
    }));
  }

  checkpoint(): void {
    this.db.pragma("wal_checkpoint(PASSIVE)");
  }

  private async ensureRollingBackup(): Promise<void> {
    const last = this.db.prepare("SELECT created_at FROM backup_records WHERE kind = 'rolling' ORDER BY created_at DESC LIMIT 1").get() as Row | undefined;
    if (!last || Date.now() - Date.parse(String(last.created_at)) >= ROLLING_BACKUP_INTERVAL_MS) await this.createBackup("rolling");
  }

  private async pruneRollingBackups(): Promise<void> {
    const stale = this.db.prepare("SELECT id, file_path FROM backup_records WHERE kind = 'rolling' ORDER BY created_at DESC, id DESC LIMIT -1 OFFSET ?")
      .all(ROLLING_BACKUP_LIMIT) as Row[];
    for (const row of stale) {
      await unlink(String(row.file_path)).catch(() => undefined);
      this.db.prepare("DELETE FROM backup_records WHERE id = ?").run(row.id);
    }
    const known = new Set(this.listBackups().map((record) => record.filePath));
    for (const filename of await readdir(this.paths.backups)) {
      const filePath = path.join(this.paths.backups, filename);
      if (filename.endsWith("-rolling.sqlite") && !known.has(filePath)) await unlink(filePath).catch(() => undefined);
    }
  }

  private allocateLineId(prefix: string): string {
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const lineId = `${prefix}-${randomUUID().replaceAll("-", "").slice(0, 10)}`;
      if (!this.db.prepare("SELECT 1 FROM dialogue_nodes WHERE line_id = ?").get(lineId)) return lineId;
    }
    throw new ConflictError("Could not allocate a unique Line ID");
  }

  private assertCharacter(id: string | null | undefined): void {
    if (id && !this.db.prepare("SELECT 1 FROM characters WHERE id = ?").get(id)) throw new NotFoundError("Character", id);
  }

  private requireConversation(id: string): ConversationRecord {
    const row = this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new NotFoundError("Conversation", id);
    return mapConversation(row);
  }

  private requireNode(id: string): Row {
    const row = this.db.prepare("SELECT * FROM dialogue_nodes WHERE id = ?").get(id) as Row | undefined;
    if (!row) throw new NotFoundError("Dialogue node", id);
    return row;
  }

  private requireNodeByLineId(lineId: string): Row {
    const row = this.db.prepare("SELECT * FROM dialogue_nodes WHERE line_id = ?").get(lineId) as Row | undefined;
    if (!row) throw new NotFoundError("Line", lineId);
    return row;
  }

  private getNodeByLineId(lineId: string): DialogueNodeRecord {
    const row = this.requireNodeByLineId(lineId);
    const texts = (this.db.prepare("SELECT * FROM node_texts WHERE node_id = ? ORDER BY language_code").all(row.id) as Row[]).map(mapNodeText);
    return mapNode(row, texts);
  }

  private assertVersion(aggregateType: "project" | "conversation", aggregateId: string, expected: number | undefined, current: number): void {
    if (expected === undefined || expected === current) return;
    const changes = (this.db.prepare(`SELECT * FROM mutation_log
      WHERE aggregate_type = ? AND aggregate_id = ? AND new_version > ? ORDER BY sequence`).all(aggregateType, aggregateId, expected) as Row[])
      .map((row) => this.mapMutation(row));
    throw new ConcurrencyError(aggregateId, expected, current, changes);
  }

  private commitProjectMutation(project: ProjectRecord, operation: string, source: MutationSource, changes: unknown): { version: number; changeSequence: number } {
    const version = project.version + 1;
    const timestamp = now();
    this.db.prepare("UPDATE projects SET version = ?, updated_at = ? WHERE id = ?").run(version, timestamp, project.id);
    const result = this.db.prepare(`INSERT INTO mutation_log
      (project_id, aggregate_type, aggregate_id, conversation_id, base_version, new_version, operation, source, changes_json, created_at)
      VALUES (?, 'project', ?, NULL, ?, ?, ?, ?, ?, ?)`).run(
      project.id, project.id, project.version, version, operation, source, JSON.stringify(changes), timestamp,
    );
    return { version, changeSequence: Number(result.lastInsertRowid) };
  }

  private commitConversationMutation(conversation: ConversationRecord, operation: string, source: MutationSource, changes: unknown): { version: number; changeSequence: number } {
    const version = conversation.version + 1;
    const timestamp = now();
    this.db.prepare("UPDATE conversations SET version = ?, updated_at = ? WHERE id = ?").run(version, timestamp, conversation.id);
    const result = this.db.prepare(`INSERT INTO mutation_log
      (project_id, aggregate_type, aggregate_id, conversation_id, base_version, new_version, operation, source, changes_json, created_at)
      VALUES (?, 'conversation', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
      conversation.projectId, conversation.id, conversation.id, conversation.version, version, operation, source, JSON.stringify(changes), timestamp,
    );
    return { version, changeSequence: Number(result.lastInsertRowid) };
  }

  private mapMutation(row: Row): MutationRecord {
    return {
      sequence: Number(row.sequence), aggregateType: String(row.aggregate_type) as MutationRecord["aggregateType"],
      aggregateId: String(row.aggregate_id), conversationId: row.conversation_id ? String(row.conversation_id) : null,
      baseVersion: Number(row.base_version), newVersion: Number(row.new_version), operation: String(row.operation),
      source: String(row.source) as MutationSource, changes: parseJson<unknown>(row.changes_json), createdAt: String(row.created_at),
    };
  }

  private refreshSearch(lineId: string, language: string, text: string, menuText: string | null): void {
    this.db.prepare("DELETE FROM line_search WHERE line_id = ? AND language_code = ?").run(lineId, language);
    this.db.prepare("INSERT INTO line_search(line_id, language_code, dialogue_text, menu_text) VALUES (?, ?, ?, ?)")
      .run(lineId, language, text, menuText);
  }
}
