import { z } from "zod";

export const SCHEMA_VERSION = 1 as const;

export const DEFAULT_LANGUAGES = ["en", "el", "it", "de", "griko"] as const;

export const IdSchema = z.string().uuid();
export const LineIdSchema = z.string().regex(/^[a-z0-9][a-z0-9_-]{3,63}$/);
export const LanguageCodeSchema = z
  .string()
  .min(2)
  .max(24)
  .regex(/^[a-z][a-z0-9-]*$/);

export const NodeKindSchema = z.enum(["start", "line", "choice", "group"]);
export const TextStatusSchema = z.enum([
  "placeholder",
  "draft",
  "polished",
  "edited",
  "final",
  "rework",
]);
export const VoiceStatusSchema = z.enum([
  "none",
  "placeholder",
  "recorded",
  "processed",
  "final",
  "rework",
]);
export const VerificationStatusSchema = z.enum(["unverified", "native-verified"]);
export const SubtitleOverrideSchema = z.enum(["none", "forced"]);
export const MutationSourceSchema = z.enum(["human", "agent", "system"]);
export const VariableTypeSchema = z.enum(["boolean", "number", "text"]);

export const CreateProjectInputSchema = z
  .object({
    name: z.string().trim().min(1).max(120),
    slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
    languages: z.array(LanguageCodeSchema).min(1).default([...DEFAULT_LANGUAGES]),
    defaultLanguage: LanguageCodeSchema.default("en"),
  })
  .superRefine((value, ctx) => {
    if (!value.languages.includes(value.defaultLanguage)) {
      ctx.addIssue({
        code: "custom",
        path: ["defaultLanguage"],
        message: "defaultLanguage must be included in languages",
      });
    }
    if (new Set(value.languages).size !== value.languages.length) {
      ctx.addIssue({ code: "custom", path: ["languages"], message: "languages must be unique" });
    }
  });

export const CreateLevelInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  sortOrder: z.number().int().nonnegative().default(0),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export const CreateSceneInputSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z.string().trim().regex(/^[a-z0-9][a-z0-9-]{1,62}$/),
  levelId: IdSchema.nullable().optional(),
  beatRef: z.string().trim().max(300).default(""),
  sortOrder: z.number().int().nonnegative().default(0),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export const CreateConversationInputSchema = z.object({
  sceneId: IdSchema,
  title: z.string().trim().min(1).max(200),
  description: z.string().max(4_000).default(""),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export const AddNodeInputSchema = z.object({
  conversationId: IdSchema,
  kind: NodeKindSchema.exclude(["start"]).default("line"),
  speakerCharacterId: IdSchema.nullable().optional(),
  listenerCharacterId: IdSchema.nullable().optional(),
  spokenLanguage: LanguageCodeSchema.optional(),
  text: z.string().max(20_000).optional(),
  menuText: z.string().max(2_000).optional(),
  isTerminal: z.boolean().default(false),
  x: z.number().finite().default(0),
  y: z.number().finite().default(0),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export const LinkNodesInputSchema = z.object({
  originNodeId: IdSchema,
  destinationNodeId: IdSchema,
  priority: z.number().int().nonnegative().default(0),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
  force: z.boolean().default(false),
});

export const SetNodeTextInputSchema = z.object({
  lineId: LineIdSchema,
  language: LanguageCodeSchema,
  text: z.string().max(20_000),
  menuText: z.string().max(2_000).nullable().optional(),
  verificationStatus: VerificationStatusSchema.optional(),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
  force: z.boolean().default(false),
});

export const SetLineStatusInputSchema = z.object({
  lineId: LineIdSchema,
  status: TextStatusSchema,
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
  force: z.boolean().default(false),
});

export const SetVoiceStatusInputSchema = z.object({
  lineId: LineIdSchema,
  status: VoiceStatusSchema,
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
  force: z.boolean().default(false),
});

export const UpsertCharacterInputSchema = z.object({
  id: IdSchema.optional(),
  name: z.string().trim().min(1).max(120),
  displayNames: z.record(LanguageCodeSchema, z.string().max(200)).default({}),
  isPlayer: z.boolean().default(false),
  portraitPath: z.string().max(1_000).nullable().default(null),
  description: z.string().max(8_000).default(""),
  actorNotes: z.string().max(8_000).default(""),
  voiceNotes: z.string().max(8_000).default(""),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export const DeclareVariableInputSchema = z.object({
  name: z.string().trim().regex(/^[A-Za-z_][A-Za-z0-9_.-]{0,127}$/),
  type: VariableTypeSchema,
  initialValue: z.union([z.boolean(), z.number(), z.string()]),
  description: z.string().max(2_000).default(""),
  expectedVersion: z.number().int().positive().optional(),
  source: MutationSourceSchema.default("human"),
});

export type CreateProjectInput = z.infer<typeof CreateProjectInputSchema>;
export type CreateLevelInput = z.infer<typeof CreateLevelInputSchema>;
export type CreateSceneInput = z.infer<typeof CreateSceneInputSchema>;
export type CreateConversationInput = z.infer<typeof CreateConversationInputSchema>;
export type AddNodeInput = z.infer<typeof AddNodeInputSchema>;
export type LinkNodesInput = z.infer<typeof LinkNodesInputSchema>;
export type SetNodeTextInput = z.infer<typeof SetNodeTextInputSchema>;
export type SetLineStatusInput = z.infer<typeof SetLineStatusInputSchema>;
export type SetVoiceStatusInput = z.infer<typeof SetVoiceStatusInputSchema>;
export type UpsertCharacterInput = z.infer<typeof UpsertCharacterInputSchema>;
export type DeclareVariableInput = z.infer<typeof DeclareVariableInputSchema>;
export type NodeKind = z.infer<typeof NodeKindSchema>;
export type TextStatus = z.infer<typeof TextStatusSchema>;
export type VoiceStatus = z.infer<typeof VoiceStatusSchema>;
export type VerificationStatus = z.infer<typeof VerificationStatusSchema>;
export type MutationSource = z.infer<typeof MutationSourceSchema>;

export interface MutationRecord {
  sequence: number;
  aggregateType: "project" | "conversation";
  aggregateId: string;
  conversationId: string | null;
  baseVersion: number;
  newVersion: number;
  operation: string;
  source: MutationSource;
  changes: unknown;
  createdAt: string;
}

export interface ValidationIssue {
  code: string;
  severity: "error" | "warning";
  message: string;
  projectId: string;
  sceneId?: string;
  conversationId?: string;
  nodeId?: string;
  lineId?: string;
  language?: string;
}

export interface ValidationReport {
  valid: boolean;
  errors: number;
  warnings: number;
  issues: ValidationIssue[];
}

export function getSchemaDescriptor() {
  return {
    schemaVersion: SCHEMA_VERSION,
    nodeKinds: NodeKindSchema.options,
    textStatuses: TextStatusSchema.options,
    voiceStatuses: VoiceStatusSchema.options,
    verificationStatuses: VerificationStatusSchema.options,
    subtitleOverrides: SubtitleOverrideSchema.options,
    mutationSources: MutationSourceSchema.options,
    variableTypes: VariableTypeSchema.options,
    defaultLanguages: DEFAULT_LANGUAGES,
  } as const;
}
