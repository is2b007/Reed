import type {
  ConversationGraph,
  MutationRecord,
  ProjectSnapshot,
  SearchResult,
  ValidationReport,
} from "@reed/core";

export interface EditorBootstrap {
  root: string;
  snapshot: ProjectSnapshot;
  validation: ValidationReport;
  lastChangeSequence: number;
}

export type MutationName =
  | "createLevel" | "createScene" | "createConversation" | "createPartition"
  | "addNode" | "linkNodes" | "unlinkNodes" | "updateNode" | "deleteNode"
  | "setNodeText" | "setLineStatus" | "setVoiceStatus"
  | "upsertCharacter" | "declareVariable" | "approveReview" | "createBackup";

export interface ReedDesktopApi {
  chooseProject(): Promise<string | null>;
  chooseNewProject(): Promise<string | null>;
  createProject(root: string, input: { name: string; slug: string; languages: string[]; defaultLanguage: string }): Promise<EditorBootstrap>;
  openProject(root: string): Promise<EditorBootstrap>;
  getBootstrap(): Promise<EditorBootstrap | null>;
  getConversation(id: string): Promise<ConversationGraph>;
  getChanges(afterSequence: number): Promise<MutationRecord[]>;
  mutate(name: MutationName, input: unknown): Promise<unknown>;
  validate(): Promise<ValidationReport>;
  findLines(filters: { query?: string; characterId?: string; tag?: string; status?: string; language?: string; missingLanguage?: string }): Promise<SearchResult[]>;
  getReviewDiff(): Promise<MutationRecord[]>;
  export(kind: "project" | "pixel-single" | "pixel-partitioned" | "voice" | "screenplay", options?: Record<string, unknown>): Promise<unknown>;
}

declare global {
  interface Window {
    reed: ReedDesktopApi;
  }
}
