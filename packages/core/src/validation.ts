import type { ValidationIssue, ValidationReport } from "@reed/schema";
import type { ReedProject } from "./project.js";

type Row = Record<string, unknown>;

function text(value: unknown): string {
  return value === null || value === undefined ? "" : String(value);
}

export function validateProject(reed: ReedProject): ValidationReport {
  const project = reed.getProject();
  const issues: ValidationIssue[] = [];
  const conversations = reed.listConversations();
  const declaredVariables = new Set(reed.listVariables().map((variable) => variable.name));

  for (const conversation of conversations) {
    const graph = reed.getConversation(conversation.id);
    const starts = graph.nodes.filter((node) => node.kind === "start");
    if (starts.length !== 1) {
      issues.push({
        code: "START_COUNT", severity: "error", projectId: project.id, conversationId: graph.id,
        sceneId: graph.sceneId, message: `Conversation must have exactly one start node; found ${starts.length}`,
      });
    }

    const outgoing = new Map<string, string[]>();
    for (const link of graph.links) {
      const values = outgoing.get(link.originNodeId) ?? [];
      values.push(link.destinationNodeId);
      outgoing.set(link.originNodeId, values);
    }

    const reachable = new Set<string>();
    const stack = starts.map((node) => node.id);
    while (stack.length > 0) {
      const id = stack.pop();
      if (!id || reachable.has(id)) continue;
      reachable.add(id);
      for (const destination of outgoing.get(id) ?? []) stack.push(destination);
    }

    for (const node of graph.nodes) {
      if (!reachable.has(node.id)) {
        issues.push({
          code: "UNREACHABLE_NODE", severity: "error", projectId: project.id, sceneId: graph.sceneId,
          conversationId: graph.id, nodeId: node.id, lineId: node.lineId, message: `Line ${node.lineId} is unreachable from the start node`,
        });
      }
      if (!node.isTerminal && node.kind !== "group" && (outgoing.get(node.id)?.length ?? 0) === 0) {
        issues.push({
          code: "DEAD_END", severity: "error", projectId: project.id, sceneId: graph.sceneId,
          conversationId: graph.id, nodeId: node.id, lineId: node.lineId,
          message: `Line ${node.lineId} has no outgoing link and is not marked terminal`,
        });
      }
      if (node.kind === "line" || node.kind === "choice") {
        const byLanguage = new Map(node.texts.map((entry) => [entry.language, entry]));
        for (const language of project.languages) {
          if (!byLanguage.get(language)?.text.trim()) {
            issues.push({
              code: "MISSING_TRANSLATION", severity: "error", projectId: project.id, sceneId: graph.sceneId,
              conversationId: graph.id, nodeId: node.id, lineId: node.lineId, language,
              message: `Line ${node.lineId} is missing ${language} text`,
            });
          }
        }
        if (!node.speakerCharacterId) {
          issues.push({
            code: "MISSING_SPEAKER", severity: "warning", projectId: project.id, sceneId: graph.sceneId,
            conversationId: graph.id, nodeId: node.id, lineId: node.lineId, message: `Line ${node.lineId} has no speaker`,
          });
        }
      }

      const variablePattern = /Variable\s*\[\s*["']([^"']+)["']\s*\]/g;
      for (const source of [node.conditions, node.userScript]) {
        for (const match of source.matchAll(variablePattern)) {
          const name = match[1];
          if (name && !declaredVariables.has(name)) {
            issues.push({
              code: "UNDECLARED_VARIABLE", severity: "error", projectId: project.id, sceneId: graph.sceneId,
              conversationId: graph.id, nodeId: node.id, lineId: node.lineId,
              message: `Line ${node.lineId} references undeclared variable ${name}`,
            });
          }
        }
      }
    }
  }

  const invalidLinks = reed.db.prepare(`SELECT dl.id, dl.origin_conversation_id, dl.destination_conversation_id,
    origin.conversation_id AS actual_origin, destination.conversation_id AS actual_destination
    FROM dialogue_links dl
    JOIN dialogue_nodes origin ON origin.id = dl.origin_node_id
    JOIN dialogue_nodes destination ON destination.id = dl.destination_node_id
    WHERE dl.origin_conversation_id != origin.conversation_id OR dl.destination_conversation_id != destination.conversation_id`).all() as Row[];
  for (const row of invalidLinks) {
    issues.push({
      code: "LINK_CONVERSATION_MISMATCH", severity: "error", projectId: project.id,
      conversationId: text(row.origin_conversation_id), message: `Link ${text(row.id)} stores inconsistent conversation endpoints`,
    });
  }

  const partitions = reed.db.prepare("SELECT id, name, base_id, range_size FROM database_partitions ORDER BY base_id, id").all() as Row[];
  for (let index = 0; index < partitions.length; index += 1) {
    const left = partitions[index];
    if (!left) continue;
    const leftEnd = Number(left.base_id) + Number(left.range_size) - 1;
    for (let other = index + 1; other < partitions.length; other += 1) {
      const right = partitions[other];
      if (!right || Number(right.base_id) > leftEnd) break;
      issues.push({
        code: "PARTITION_RANGE_OVERLAP", severity: "error", projectId: project.id,
        message: `Database ID ranges overlap: ${text(left.name)} and ${text(right.name)}`,
      });
    }
  }

  issues.sort((a, b) => [a.severity, a.code, a.sceneId ?? "", a.conversationId ?? "", a.lineId ?? "", a.language ?? ""]
    .join("\0").localeCompare([b.severity, b.code, b.sceneId ?? "", b.conversationId ?? "", b.lineId ?? "", b.language ?? ""].join("\0")));
  const errors = issues.filter((issue) => issue.severity === "error").length;
  const warnings = issues.length - errors;
  return { valid: errors === 0, errors, warnings, issues };
}
