import { readFile } from "node:fs/promises";
import path from "node:path";
import { atomicWriteFile } from "./atomic-write.js";
import type { ProjectSnapshot } from "./models.js";
import type { ReedProject } from "./project.js";

export function createProjectSnapshot(reed: ReedProject): ProjectSnapshot {
  return {
    format: "reed-project",
    formatVersion: 1,
    exportedAt: null,
    project: reed.getProject(),
    levels: reed.listLevels(),
    scenes: reed.listScenes(),
    conversations: reed.listConversations().map((conversation) => reed.getConversation(conversation.id)),
    characters: reed.listCharacters(),
    variables: reed.listVariables(),
    partitions: reed.listPartitions(),
    reviewSnapshots: reed.listReviewSnapshots(),
    allocations: {
      entryNumericIds: Object.fromEntries(
        reed.listConversations()
          .map((conversation) => [conversation.id, reed.getIssuedEntryNumericId(conversation.id)] as const)
          .sort(([left], [right]) => left.localeCompare(right)),
      ),
    },
  };
}

export function serializeProject(reed: ReedProject): string {
  return `${JSON.stringify(createProjectSnapshot(reed), null, 2)}\n`;
}

export async function exportProjectJson(reed: ReedProject, outputPath?: string): Promise<string> {
  const target = path.resolve(outputPath ?? path.join(reed.paths.exports, "reed-project.json"));
  const serialized = serializeProject(reed);
  // Skip identical rewrites so status checks do not churn file timestamps or watchers.
  const current = await readFile(target, "utf8").catch(() => null);
  if (current === serialized) return target;
  return atomicWriteFile(target, serialized);
}
