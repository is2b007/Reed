import type {
  MutationRecord,
  NodeKind,
  TextStatus,
  VerificationStatus,
  VoiceStatus,
} from "@reed/schema";

export interface ProjectRecord {
  id: string;
  name: string;
  slug: string;
  schemaVersion: number;
  languages: string[];
  defaultLanguage: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface LevelRecord {
  id: string;
  projectId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface SceneRecord {
  id: string;
  projectId: string;
  levelId: string | null;
  partitionId: string;
  name: string;
  slug: string;
  lineIdPrefix: string;
  beatRef: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationRecord {
  id: string;
  projectId: string;
  sceneId: string;
  partitionId: string;
  title: string;
  description: string;
  numericId: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface NodeTextRecord {
  language: string;
  text: string;
  menuText: string | null;
  verificationStatus: VerificationStatus;
  createdAt: string;
  updatedAt: string;
}

export interface DialogueNodeRecord {
  id: string;
  conversationId: string;
  lineId: string;
  entryNumericId: number;
  kind: NodeKind;
  speakerCharacterId: string | null;
  listenerCharacterId: string | null;
  spokenLanguage: string;
  sequence: string;
  conditions: string;
  userScript: string;
  subtitleOverride: "none" | "forced";
  contextComment: string;
  voiceComment: string;
  contextPath: string[];
  lineStatus: TextStatus;
  voiceStatus: VoiceStatus;
  tags: string[];
  isTerminal: boolean;
  x: number;
  y: number;
  createdAt: string;
  updatedAt: string;
  texts: NodeTextRecord[];
}

export interface DialogueLinkRecord {
  id: string;
  originConversationId: string;
  originNodeId: string;
  destinationConversationId: string;
  destinationNodeId: string;
  priority: number;
  createdAt: string;
  updatedAt: string;
}

export interface ConversationGraph extends ConversationRecord {
  nodes: DialogueNodeRecord[];
  links: DialogueLinkRecord[];
}

export interface CharacterRecord {
  id: string;
  projectId: string;
  numericId: number;
  name: string;
  displayNames: Record<string, string>;
  isPlayer: boolean;
  portraitPath: string | null;
  description: string;
  actorNotes: string;
  voiceNotes: string;
  createdAt: string;
  updatedAt: string;
}

export interface VariableRecord {
  id: string;
  projectId: string;
  numericId: number;
  name: string;
  type: "boolean" | "number" | "text";
  initialValue: boolean | number | string;
  description: string;
  createdAt: string;
  updatedAt: string;
}

export interface DatabasePartitionRecord {
  id: string;
  projectId: string;
  name: string;
  scopeType: "project" | "level" | "scene";
  scopeId: string | null;
  baseId: number;
  rangeSize: number;
  exportOrder: number;
  createdAt: string;
  updatedAt: string;
}

export interface ReviewSnapshotRecord {
  id: string;
  projectId: string;
  backupId: string;
  label: string;
  mutationSequence: number;
  createdAt: string;
}

export interface BackupRecord {
  id: string;
  projectId: string;
  kind: "rolling" | "named";
  label: string | null;
  filePath: string;
  createdAt: string;
}

export interface MutationResult<T> {
  value: T;
  version: number;
  changeSequence: number;
}

export interface StaleDiff {
  currentVersion: number;
  changes: MutationRecord[];
}

export interface SearchResult {
  lineId: string;
  language: string;
  text: string;
  menuText: string | null;
  conversationId: string;
  conversationTitle: string;
  sceneId: string;
  sceneName: string;
  speakerCharacterId: string | null;
  lineStatus: TextStatus;
  voiceStatus: VoiceStatus;
  tags: string[];
}

export interface ProjectSnapshot {
  format: "reed-project";
  formatVersion: 1;
  exportedAt: null;
  project: ProjectRecord;
  levels: LevelRecord[];
  scenes: SceneRecord[];
  conversations: ConversationGraph[];
  characters: CharacterRecord[];
  variables: VariableRecord[];
  partitions: DatabasePartitionRecord[];
  reviewSnapshots: ReviewSnapshotRecord[];
}
