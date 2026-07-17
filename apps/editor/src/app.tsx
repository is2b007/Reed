import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow,
  SelectionMode, useNodesState, type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import type {
  CharacterRecord, ConversationGraph, DialogueNodeRecord, MutationRecord, ProjectSnapshot,
  SceneRecord, SearchResult, ValidationIssue, ValidationReport, VariableRecord,
} from "@reed/core";
import type { EditorBootstrap, MutationName } from "./contract.js";
import { evaluatePlaytestCondition, globalShortcut, nextMenuIndex, promptValueIsValid } from "./ui-logic.js";
import reedLogo from "../assets/reed-logo.png";

type Workspace = "graph" | "beats" | "playtest" | "translation" | "characters" | "validation" | "review" | "production" | "read";
interface CardData extends Record<string, unknown> { record: DialogueNodeRecord; speaker: string; primary: string; secondary: string; onPath: boolean; }
type CardNode = Node<CardData, "dialogue">;

const workspaces: Array<{ id: Workspace; label: string; key: string }> = [
  { id: "graph", label: "Graph", key: "1" }, { id: "beats", label: "Beats", key: "2" },
  { id: "playtest", label: "Playtest", key: "3" }, { id: "translation", label: "Translation", key: "4" },
  { id: "characters", label: "Characters", key: "5" }, { id: "validation", label: "Validation", key: "6" },
  { id: "review", label: "Review", key: "7" }, { id: "production", label: "Production", key: "8" },
  { id: "read", label: "Read", key: "9" },
];
const primaryWorkspaces = workspaces.slice(0, 4);
const secondaryWorkspaceGroups = [
  { label: "Project", items: workspaces.slice(4, 5) },
  { label: "Quality", items: workspaces.slice(5, 7) },
  { label: "Output", items: workspaces.slice(7) },
];
const secondaryWorkspaces = secondaryWorkspaceGroups.flatMap((group) => group.items);
const secondaryWorkspaceIndex = new Map(secondaryWorkspaces.map((workspace, index) => [workspace.id, index]));
const desktopPanelMedia = "(min-width: 901px)";

function desktopPanelLayout(): boolean {
  return typeof window !== "undefined" && window.matchMedia(desktopPanelMedia).matches;
}

const DialogueCard = memo(({ data, selected }: NodeProps<CardNode>) => {
  const node = data.record;
  return <div className={`dialogue-card kind-${node.kind} status-${node.lineStatus} ${data.onPath ? "on-path" : ""} ${selected ? "selected" : ""}`}>
    <Handle type="target" position={Position.Left} />
    <div className="node-head"><span className="speaker">{node.kind === "start" ? "START" : data.speaker}</span><span className="status-chip">{node.lineStatus}</span></div>
    <div className="line-id">{node.lineId}</div>
    {node.kind === "start" ? <div className="group-label">Entry point</div> : node.kind === "group" ? <div className="group-label">Logic junction</div> : <>
      <div className="node-copy">{data.primary || "No text in primary language"}</div>
      {data.secondary && <div className="node-secondary">{data.secondary}</div>}
    </>}
    {node.conditions && <div className="condition">if {node.conditions}</div>}
    <Handle type="source" position={Position.Right} />
  </div>;
});
DialogueCard.displayName = "DialogueCard";
const nodeTypes = { dialogue: DialogueCard };

function message(error: unknown): string { return error instanceof Error ? error.message : String(error); }

interface PromptConfig {
  title: string;
  label: string;
  description?: string;
  defaultValue?: string;
  confirmLabel?: string;
  danger?: boolean;
  requiredValue?: string;
  options?: Array<{ value: string; label: string }>;
}
type PromptRequest = (config: PromptConfig) => Promise<string | null>;
const PromptContext = React.createContext<PromptRequest | null>(null);

function PromptDialog({ config, onFinish }: { config: PromptConfig; onFinish(value: string | null): void }) {
  const [value, setValue] = useState(config.defaultValue ?? config.options?.[0]?.value ?? "");
  const valid = promptValueIsValid(value, config.requiredValue);
  return <div className="prompt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onFinish(null); }}>
    <form className="prompt-dialog" role="dialog" aria-modal="true" aria-labelledby="prompt-title" onSubmit={(event) => { event.preventDefault(); if (valid) onFinish(value); }} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onFinish(null); } }}>
      <header><p className="eyebrow">Local project action</p><h2 id="prompt-title">{config.title}</h2>{config.description && <p>{config.description}</p>}</header>
      <label>{config.label}{config.options ? <select autoFocus value={value} onChange={(event) => setValue(event.target.value)}>{config.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select> : <input autoFocus value={value} onChange={(event) => setValue(event.target.value)} />}</label>
      {config.requiredValue !== undefined && <small>Enter the exact Line ID to enable deletion.</small>}
      <div className="prompt-actions"><button type="button" onClick={() => onFinish(null)}>Cancel</button><button type="submit" className={config.danger ? "danger" : "primary"} disabled={!valid}>{config.confirmLabel ?? "Continue"}</button></div>
    </form>
  </div>;
}

function PromptProvider({ children }: { children: React.ReactNode }) {
  const [active, setActive] = useState<{ config: PromptConfig; resolve(value: string | null): void } | null>(null);
  const request = useCallback<PromptRequest>((config) => new Promise((resolve) => setActive({ config, resolve })), []);
  const finish = (value: string | null) => { active?.resolve(value); setActive(null); };
  return <PromptContext.Provider value={request}>{children}{active && <PromptDialog config={active.config} onFinish={finish} />}</PromptContext.Provider>;
}

function usePrompt(): PromptRequest {
  const request = React.useContext(PromptContext);
  if (!request) throw new Error("PromptProvider is missing");
  return request;
}

function Welcome({ onReady }: { onReady(value: EditorBootstrap): void }) {
  const [creating, setCreating] = useState(false);
  const [name, setName] = useState("Untitled dialogue");
  const [slug, setSlug] = useState("untitled-dialogue");
  const [error, setError] = useState("");
  const open = async () => {
    try { const root = await window.reed.chooseProject(); if (root) onReady(await window.reed.openProject(root)); } catch (value) { setError(message(value)); }
  };
  const create = async () => {
    try {
      const root = await window.reed.chooseNewProject();
      if (root) onReady(await window.reed.createProject(root, { name, slug, languages: ["en", "el", "it", "de", "griko"], defaultLanguage: "en" }));
    } catch (value) { setError(message(value)); }
  };
  return <main className="welcome">
    <div className="welcome-mark"><img src={reedLogo} alt="Reed" /></div>
    <div className="welcome-copy"><p className="eyebrow">Offline dialogue production</p><h1>Keep every branch<br />under control.</h1>
      <p>Write, localize, review, validate, voice, and hand dialogue to Unity without an account or network connection.</p>
      <div className="welcome-actions"><button className="primary" onClick={open}>Open project</button><button onClick={() => setCreating(!creating)}>New project</button></div>
      {creating && <div className="new-project"><label>Project name<input value={name} onChange={(event) => { setName(event.target.value); setSlug(event.target.value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")); }} /></label>
        <label>Stable slug<input value={slug} onChange={(event) => setSlug(event.target.value)} /></label><button className="primary" onClick={create}>Choose folder and create</button></div>}
      {error && <div className="error-banner">{error}</div>}
    </div>
    <aside className="welcome-strip"><span>EN</span><span>ΕΛ</span><span>IT</span><span>DE</span><span>GRK</span></aside>
  </main>;
}

function Navigator({ snapshot, selectedConversationId, open, onConversation, onScene, onClose }: { snapshot: ProjectSnapshot; selectedConversationId: string | null; open: boolean; onConversation(id: string): void; onScene(id: string): void; onClose(): void }) {
  const [collapsedLevels, setCollapsedLevels] = useState<Set<string>>(() => new Set());
  const toggleLevel = (levelId: string) => setCollapsedLevels((current) => {
    const next = new Set(current);
    if (next.has(levelId)) next.delete(levelId); else next.add(levelId);
    return next;
  });
  return <nav id="project-navigator" className={`navigator ${open ? "panel-open" : ""}`} aria-label="Project navigator">
    <div className="panel-title"><span>Project</span><kbd>⌘K</kbd><button className="panel-close" aria-label="Close project navigator" onClick={onClose}>×</button></div>
    <div className="project-name"><i />{snapshot.project.name}</div>
    {snapshot.levels.map((level) => { const expanded = !collapsedLevels.has(level.id); return <div className="tree-level" key={level.id}>
      <button className="tree-heading level" aria-expanded={expanded} onClick={() => toggleLevel(level.id)}><span className="disclosure" aria-hidden="true">⌄</span>{level.name}</button>
      {expanded && snapshot.scenes.filter((scene) => scene.levelId === level.id).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    </div>; })}
    {snapshot.scenes.filter((scene) => !scene.levelId).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    {snapshot.scenes.length === 0 && <div className="panel-empty">No scenes yet.<br />Create the first beat from Beat map.</div>}
  </nav>;
}

function SceneTree({ sceneId, snapshot, selected, onConversation, onScene }: { sceneId: string; snapshot: ProjectSnapshot; selected: string | null; onConversation(id: string): void; onScene(id: string): void }) {
  const [expanded, setExpanded] = useState(true);
  const scene = snapshot.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return null;
  return <div className="tree-scene"><div className="tree-scene-row">
    <button className="tree-disclosure" aria-label={`${expanded ? "Collapse" : "Expand"} ${scene.name}`} aria-expanded={expanded} onClick={() => setExpanded((value) => !value)}><span aria-hidden="true">⌄</span></button>
    <button className="tree-heading scene" aria-label={`Open ${scene.name} in Beat map`} onClick={() => onScene(scene.id)}><span>{scene.name}</span><small>{scene.beatRef}</small></button>
  </div>
    {expanded && snapshot.conversations.filter((conversation) => conversation.sceneId === scene.id).map((conversation) => <button key={conversation.id} className={`tree-conversation ${selected === conversation.id ? "active" : ""}`} aria-current={selected === conversation.id ? "page" : undefined} onClick={() => onConversation(conversation.id)}><span>↳</span>{conversation.title}<em>v{conversation.version}</em></button>)}
  </div>;
}

function Inspector({ graph, node, primary, secondary, languages, characters, open, onMutated, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord | null; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onClose(): void }) {
  if (!node) return <aside id="line-inspector" className={`inspector ${open ? "panel-open" : ""}`}><div className="panel-title"><span>Inspector</span><button className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div><div className="panel-empty">Select a line to edit its text, production state, and logic.</div></aside>;
  return <InspectorForm key={`${node.id}-${node.updatedAt}-${primary}-${secondary}`} graph={graph} node={node} primary={primary} secondary={secondary} languages={languages} characters={characters} open={open} onMutated={onMutated} onClose={onClose} />;
}

function LanguageTextEditor({ language, role, secondary, node, value, onSave }: { language: string; role: string; secondary?: boolean; node: DialogueNodeRecord; value: DialogueNodeRecord["texts"][number] | undefined; onSave(value: { text: string; menuText: string | null; verificationStatus: "unverified" | "native-verified" }): Promise<void> }) {
  const [text, setText] = useState(value?.text ?? "");
  const [menuText, setMenuText] = useState(value?.menuText ?? "");
  const [verificationStatus, setVerificationStatus] = useState<"unverified" | "native-verified">(value?.verificationStatus ?? "unverified");
  const [saving, setSaving] = useState(false);
  const save = async () => { setSaving(true); try { await onSave({ text, menuText: menuText.trim() || null, verificationStatus }); } finally { setSaving(false); } };
  return <div className={`language-editor ${secondary ? "secondary" : ""}`}><label className={`language-label ${secondary ? "secondary" : ""}`}><span>{language.toUpperCase()} · {role}</span><textarea rows={secondary ? 4 : 5} value={text} onChange={(event) => setText(event.target.value)} /></label>
    <label>Menu label<input value={menuText} maxLength={2000} placeholder={node.kind === "choice" ? "Optional choice label" : "Optional playtest label"} onChange={(event) => setMenuText(event.target.value)} /></label>
    <label>Translation verification<select value={verificationStatus} onChange={(event) => setVerificationStatus(event.target.value as "unverified" | "native-verified")}><option value="unverified">Unverified</option><option value="native-verified">Native verified</option></select></label>
    <button type="button" onClick={() => void save()} disabled={saving}>{saving ? "Saving…" : `Save ${language.toUpperCase()} text`}</button>
  </div>;
}

function InspectorForm({ graph, node, primary, secondary, languages, characters, open, onMutated, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onClose(): void }) {
  const [conditions, setConditions] = useState(node.conditions); const [sequence, setSequence] = useState(node.sequence);
  const [script, setScript] = useState(node.userScript); const [context, setContext] = useState(node.contextComment);
  const [terminal, setTerminal] = useState(node.isTerminal); const [contextPath, setContextPath] = useState(node.contextPath.join(", "));
  const [voiceComment, setVoiceComment] = useState(node.voiceComment); const [tags, setTags] = useState(node.tags.join(", "));
  const [error, setError] = useState("");
  const mutate = async (name: MutationName, input: Record<string, unknown>) => {
    try { setError(""); await window.reed.mutate(name, { ...input, expectedVersion: graph.version, source: "human" }); await onMutated(); }
    catch (value) { setError(message(value)); }
  };
  const forceRework = () => node.lineStatus === "final" ? window.confirm("This line is Final. Reopen it for rework?") : false;
  const saveText = (language: string, value: { text: string; menuText: string | null; verificationStatus: "unverified" | "native-verified" }) => mutate("setNodeText", { lineId: node.lineId, language, text: value.text, menuText: value.menuText, verificationStatus: value.verificationStatus, force: forceRework() });
  const deleteLine = () => {
    const finalWarning = node.lineStatus === "final" ? " This line is Final." : "";
    if (!window.confirm(`Delete line ${node.lineId}? This removes the node and its links.${finalWarning} A local backup is created automatically, and permanent IDs are never reused.`)) return;
    void mutate("deleteNode", { lineId: node.lineId, confirmation: node.lineId, force: node.lineStatus === "final" });
  };
  return <aside id="line-inspector" className={`inspector ${open ? "panel-open" : ""}`}>
    <div className="panel-title"><span>Line inspector</span><span className={`dot status-${node.lineStatus}`} /><button className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div>
    <section><div className="inspector-id">{node.lineId}<button onClick={() => navigator.clipboard.writeText(node.lineId)}>Copy</button></div>
      <div className="field-grid"><label>Speaker<select value={node.speakerCharacterId ?? ""} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, speakerCharacterId: event.target.value || null, force: forceRework() })}><option value="">Unassigned</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Listener<select value={node.listenerCharacterId ?? ""} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, listenerCharacterId: event.target.value || null, force: forceRework() })}><option value="">Unassigned</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Text status<select value={node.lineStatus} onChange={(event) => { const status = event.target.value; const force = status === "final"; if (force && !window.confirm("Mark this line Final?")) return; void mutate("setLineStatus", { lineId: node.lineId, status, force }); }}>{["placeholder", "draft", "polished", "edited", "final", "rework"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Voice status<select value={node.voiceStatus} onChange={(event) => { const status = event.target.value; const force = status === "final"; if (force && !window.confirm("Mark this recording Final?")) return; void mutate("setVoiceStatus", { lineId: node.lineId, status, force }); }}>{["none", "placeholder", "recorded", "processed", "final", "rework"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Spoken language<select value={node.spokenLanguage} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, spokenLanguage: event.target.value, force: forceRework() })}>{languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label>
      <label>Subtitle mode<select value={node.subtitleOverride} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, subtitleOverride: event.target.value, force: forceRework() })}><option value="none">Normal</option><option value="forced">Forced subtitle</option></select></label></div>
    </section>
    {node.kind !== "start" && node.kind !== "group" && <section><LanguageTextEditor language={primary} role="primary" node={node} value={node.texts.find((value) => value.language === primary)} onSave={(value) => saveText(primary, value)} />
      {secondary !== primary && <LanguageTextEditor language={secondary} role="reference" secondary node={node} value={node.texts.find((value) => value.language === secondary)} onSave={(value) => saveText(secondary, value)} />}</section>}
    <details open><summary>Logic & sequence</summary><label>Conditions<textarea rows={3} className="code" value={conditions} onChange={(event) => setConditions(event.target.value)} /></label><label>Sequence<textarea rows={2} className="code" value={sequence} onChange={(event) => setSequence(event.target.value)} /></label><label>User script<textarea rows={2} className="code" value={script} onChange={(event) => setScript(event.target.value)} /></label><label className="inspector-checkbox"><input type="checkbox" checked={terminal} onChange={(event) => setTerminal(event.target.checked)} /><span>Deliberate endpoint</span></label><button onClick={() => void mutate("updateNode", { lineId: node.lineId, conditions, sequence, userScript: script, isTerminal: terminal, force: forceRework() })}>Save logic</button></details>
    <details><summary>Voice context</summary><label>Context<textarea rows={3} value={context} onChange={(event) => setContext(event.target.value)} /></label><label>Performance direction<textarea rows={3} value={voiceComment} onChange={(event) => setVoiceComment(event.target.value)} /></label><label>Authored context path<input className="code" value={contextPath} placeholder="line-id, next-line-id" onChange={(event) => setContextPath(event.target.value)} /></label><label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} /></label><button onClick={() => void mutate("updateNode", { lineId: node.lineId, contextComment: context, voiceComment, contextPath: contextPath.split(/[\s,]+/u).map((lineId) => lineId.trim()).filter(Boolean), tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), force: forceRework() })}>Save context</button></details>
    {node.kind !== "start" && <button className="danger-action" onClick={deleteLine}>Delete line…</button>}
    {error && <div className="error-banner">{error}</div>}
  </aside>;
}

function GraphWorkspace({ graph, snapshot, selectedNodeId, onSelect, onMutated, primary, secondary }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; selectedNodeId: string | null; onSelect(id: string): void; onMutated(): Promise<void>; primary: string; secondary: string }) {
  const [graphError, setGraphError] = useState("");
  const characters = useMemo(() => new Map(snapshot.characters.map((character) => [character.id, character.name])), [snapshot.characters]);
  const pathIds = useMemo(() => {
    const ids = new Set<string>(); if (!graph || !selectedNodeId) return ids;
    const start = graph.nodes.find((node) => node.kind === "start"); if (!start) return ids;
    const parent = new Map<string, string>(); const queue = [start.id]; const seen = new Set(queue);
    while (queue.length) { const origin = queue.shift(); if (!origin) break; for (const edge of graph.links.filter((link) => link.originNodeId === origin)) if (!seen.has(edge.destinationNodeId)) { seen.add(edge.destinationNodeId); parent.set(edge.destinationNodeId, origin); queue.push(edge.destinationNodeId); } }
    let current: string | undefined = selectedNodeId; while (current) { ids.add(current); current = parent.get(current); } return ids;
  }, [graph, selectedNodeId]);
  const graphNodes = useMemo<CardNode[]>(() => graph?.nodes.map((node) => ({ id: node.id, type: "dialogue", position: { x: node.x, y: node.y }, selected: node.id === selectedNodeId,
    data: { record: node, speaker: node.speakerCharacterId ? characters.get(node.speakerCharacterId) ?? "Unknown" : "Unassigned", primary: node.texts.find((value) => value.language === primary)?.text ?? "", secondary: node.texts.find((value) => value.language === secondary)?.text ?? "", onPath: pathIds.has(node.id) },
  })) ?? [], [graph, selectedNodeId, characters, primary, secondary, pathIds]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(graphNodes);
  useEffect(() => setNodes(graphNodes), [graphNodes, setNodes]);
  const selectedCount = nodes.filter((node) => node.selected).length;
  const edges = useMemo<Edge[]>(() => graph?.links.map((link) => ({ id: link.id, source: link.originNodeId, target: link.destinationNodeId,
    label: graph.nodes.find((node) => node.id === link.destinationNodeId)?.conditions.slice(0, 42),
    style: pathIds.has(link.originNodeId) && pathIds.has(link.destinationNodeId) ? { stroke: "#b6cb78", strokeWidth: 3 } : { stroke: "#526057", strokeWidth: 1.5 },
  })) ?? [], [graph, pathIds]);
  const connect = async (connection: Connection) => { if (!connection.source || !connection.target || !graph) return; await window.reed.mutate("linkNodes", { originNodeId: connection.source, destinationNodeId: connection.target, expectedVersion: graph.version, source: "human", force: false }); await onMutated(); };
  const add = async (kind: "line" | "choice" | "group") => {
    if (!graph) return;
    const result = await window.reed.mutate("addNode", { conversationId: graph.id, kind, text: "", x: 300 + graph.nodes.length * 36, y: 160 + (graph.nodes.length % 4) * 150, expectedVersion: graph.version, source: "human" }) as { value?: { id?: string } };
    await onMutated();
    if (result.value?.id) onSelect(result.value.id);
  };
  const beforeDelete = async ({ nodes: requestedNodes, edges: requestedEdges }: { nodes: CardNode[]; edges: Edge[] }) => {
    if (!graph) return false;
    setGraphError("");
    const records = requestedNodes.map((node) => graph.nodes.find((record) => record.id === node.id)).filter((record): record is DialogueNodeRecord => Boolean(record) && record?.kind !== "start");
    const startSelected = requestedNodes.some((node) => graph.nodes.find((record) => record.id === node.id)?.kind === "start");
    if (requestedNodes.length > 0) {
      if (records.length === 0) {
        window.alert("The START node cannot be deleted.");
        return false;
      }
      const finalCount = records.filter((record) => record.lineStatus === "final").length;
      const subject = records.length === 1 ? `line ${records[0]?.lineId}` : `${records.length} selected nodes`;
      const finalWarning = finalCount > 0 ? ` ${finalCount} selected ${finalCount === 1 ? "line is" : "lines are"} Final.` : "";
      const startWarning = startSelected ? " The START node will be kept." : "";
      if (!window.confirm(`Delete ${subject}? This removes the selected ${records.length === 1 ? "node" : "nodes"} and their links.${finalWarning}${startWarning} A local backup is created automatically, and permanent IDs are never reused.`)) return false;
      let expectedVersion = graph.version;
      try {
        for (const record of records) {
          const result = await window.reed.mutate("deleteNode", { lineId: record.lineId, confirmation: record.lineId, expectedVersion, source: "human", force: record.lineStatus === "final" }) as { version: number };
          expectedVersion = result.version;
        }
        await onMutated();
      } catch (value) {
        setGraphError(message(value));
        await onMutated();
      }
      return false;
    }
    const links = requestedEdges.map((edge) => graph.links.find((link) => link.id === edge.id)).filter((link): link is ConversationGraph["links"][number] => Boolean(link));
    if (links.length === 0) return false;
    const touchesFinal = links.some((link) => graph.nodes.some((node) => (node.id === link.originNodeId || node.id === link.destinationNodeId) && node.kind !== "start" && node.lineStatus === "final"));
    const subject = links.length === 1 ? "this dialogue link" : `${links.length} selected dialogue links`;
    if (!window.confirm(`Remove ${subject}?${touchesFinal ? " The selection touches Final content." : ""} A local backup is created automatically.`)) return false;
    let expectedVersion = graph.version;
    try {
      for (const link of links) {
        const result = await window.reed.mutate("unlinkNodes", { linkId: link.id, expectedVersion, source: "human", force: touchesFinal }) as { version: number };
        expectedVersion = result.version;
      }
      await onMutated();
    } catch (value) {
      setGraphError(message(value));
      await onMutated();
    }
    return false;
  };
  const persistPositions = async (movedNodes: CardNode[]) => {
    if (!graph) return;
    const changed = movedNodes.map((moved) => ({ moved, record: graph.nodes.find((node) => node.id === moved.id) }))
      .filter(({ moved, record }) => record && (record.x !== moved.position.x || record.y !== moved.position.y)) as Array<{ moved: CardNode; record: DialogueNodeRecord }>;
    if (changed.length === 0) return;
    setGraphError("");
    let expectedVersion = graph.version;
    try {
      for (const { moved, record } of changed) {
        const result = await window.reed.mutate("updateNode", { lineId: record.lineId, x: moved.position.x, y: moved.position.y, expectedVersion, source: "human", force: record.lineStatus === "final" }) as { version: number };
        expectedVersion = result.version;
      }
      await onMutated();
    } catch (value) {
      setGraphError(message(value));
      await onMutated();
    }
  };
  if (!graph) return <div className="workspace-empty"><h2>Select a conversation</h2><p>The graph, playtest, and translation workspaces follow the same selection.</p></div>;
  return <div className="graph-workspace"><div className="graph-tools"><span>Add</span><button onClick={() => void add("line")}>Line</button><button onClick={() => void add("choice")}>Choice</button><button onClick={() => void add("group")}>Junction</button><small>{selectedCount > 0 ? `${selectedCount} selected · Delete selected · Two-finger pan · Space-drag` : "Drag to select · Two-finger pan · Space-drag"}</small></div>{graphError && <div className="graph-error error-banner" role="alert">{graphError}</div>}<ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.8} onNodesChange={onNodesChange} selectionOnDrag selectionMode={SelectionMode.Partial} panOnDrag={[1, 2]} panOnScroll panOnScrollSpeed={1} zoomOnScroll={false} zoomOnPinch panActivationKeyCode="Space" multiSelectionKeyCode={["Meta", "Control", "Shift"]} deleteKeyCode={["Backspace", "Delete"]} onNodeClick={(event, node) => { if (!event.metaKey && !event.ctrlKey && !event.shiftKey) onSelect(node.id); }} onConnect={(value) => void connect(value)} onBeforeDelete={(elements) => beforeDelete(elements)} onNodeDragStop={(_event, _moved, movedNodes) => void persistPositions(movedNodes)}>
    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334038" /><Controls position="bottom-right" /><MiniMap pannable zoomable nodeColor={(node) => pathIds.has(node.id) ? "#b6cb78" : "#344139"} /></ReactFlow></div>;
}

function ConversationEditor({ conversation, open, onOpen, onClose, onConversation, onSaved }: { conversation: ConversationGraph; open: boolean; onOpen(): void; onClose(): void; onConversation(): void; onSaved(): Promise<void> }) {
  const [title, setTitle] = useState(conversation.title);
  const [description, setDescription] = useState(conversation.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setTitle(conversation.title); setDescription(conversation.description); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      await window.reed.mutate("updateConversation", { id: conversation.id, title, description, expectedVersion: conversation.version, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <div className={`conversation-row ${open ? "editing" : ""}`}><button className="conversation-open" onClick={onConversation}><span><strong>{conversation.title}</strong>{conversation.description && <small>{conversation.description}</small>}</span><em>{conversation.nodes.length - 1} lines</em></button><button className="conversation-edit" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button>
    {open && <form className="metadata-form conversation-form" onSubmit={(event) => void save(event)}><label>Conversation title<input autoFocus required maxLength={200} value={title} onChange={(event) => setTitle(event.target.value)} /></label><label>Conversation description<textarea rows={3} maxLength={4000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>{error && <div className="error-banner" role="alert">{error}</div>}<div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !title.trim()}>{saving ? "Saving…" : "Save conversation"}</button></div></form>}
  </div>;
}

function SceneEditor({ scene, conversations, projectVersion, editingConversationId, onEditConversation, onConversation, refresh }: { scene: SceneRecord; conversations: ConversationGraph[]; projectVersion: number; editingConversationId: string | null; onEditConversation(id: string | null): void; onConversation(id: string): void; refresh(): Promise<void> }) {
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(scene.name);
  const [beatRef, setBeatRef] = useState(scene.beatRef);
  const [sortOrder, setSortOrder] = useState(scene.sortOrder);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setName(scene.name); setBeatRef(scene.beatRef); setSortOrder(scene.sortOrder); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    try {
      setSaving(true); setError("");
      await window.reed.mutate("updateScene", { id: scene.id, name, beatRef, sortOrder, expectedVersion: projectVersion, source: "human" });
      await refresh(); setEditing(false);
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <div className="scene-editor"><div className="scene-heading"><div><h3>{scene.name}</h3><p>{scene.beatRef || "No beat reference"}</p></div><button onClick={editing ? () => { reset(); setEditing(false); } : () => setEditing(true)}>{editing ? "Cancel" : "Edit scene"}</button></div>
    {editing && <form className="metadata-form scene-form" onSubmit={(event) => void save(event)}><div className="metadata-grid"><label>Scene name<input autoFocus required maxLength={120} value={name} onChange={(event) => setName(event.target.value)} /></label><label>Display order<input type="number" min={0} step={1} value={sortOrder} onChange={(event) => setSortOrder(Number(event.target.value))} /></label></div><label>Local beat reference<input maxLength={300} placeholder="Obsidian note, path, or beat ID" value={beatRef} onChange={(event) => setBeatRef(event.target.value)} /></label><small>The scene slug and Line ID prefix stay permanent.</small>{error && <div className="error-banner" role="alert">{error}</div>}<div className="metadata-actions"><button type="button" onClick={() => { reset(); setEditing(false); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !name.trim()}>{saving ? "Saving…" : "Save scene"}</button></div></form>}
    <div className="scene-conversations">{conversations.map((conversation) => <ConversationEditor key={`${conversation.id}-${conversation.updatedAt}`} conversation={conversation} open={editingConversationId === conversation.id} onOpen={() => onEditConversation(conversation.id)} onClose={() => onEditConversation(null)} onConversation={() => onConversation(conversation.id)} onSaved={refresh} />)}</div>
  </div>;
}

function BeatMap({ snapshot, onConversation, refresh }: { snapshot: ProjectSnapshot; onConversation(id: string): void; refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [editingConversationId, setEditingConversationId] = useState<string | null>(null);
  const [error, setError] = useState("");
  const addScene = async () => { const name = await prompt({ title: "Add scene", label: "Scene name", confirmLabel: "Create scene" }); if (!name) return; const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || `scene-${snapshot.scenes.length + 1}`; try { setError(""); await window.reed.mutate("createScene", { name, slug, beatRef: "", sortOrder: snapshot.scenes.length, expectedVersion: snapshot.project.version, source: "human" }); await refresh(); } catch (value) { setError(message(value)); } };
  const addConversation = async (sceneId: string) => { const title = await prompt({ title: "Add conversation", label: "Conversation title", confirmLabel: "Create conversation" }); if (!title) return; try { setError(""); const result = await window.reed.mutate("createConversation", { sceneId, title, description: "", expectedVersion: snapshot.project.version, source: "human" }) as { value?: { id?: string } }; await refresh(); if (result.value?.id) setEditingConversationId(result.value.id); } catch (value) { setError(message(value)); } };
  return <div className="beat-map"><header><div><p className="eyebrow">Story structure</p><h2>Beat map</h2></div><button className="primary" onClick={() => void addScene()}>Add scene</button></header>
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="beat-track">{snapshot.scenes.map((scene, index) => <article key={`${scene.id}-${scene.updatedAt}`}><span className="beat-index">{String(index + 1).padStart(2, "0")}</span><div><SceneEditor scene={scene} conversations={snapshot.conversations.filter((conversation) => conversation.sceneId === scene.id)} projectVersion={snapshot.project.version} editingConversationId={editingConversationId} onEditConversation={setEditingConversationId} onConversation={onConversation} refresh={refresh} /><button className="add-inline" onClick={() => void addConversation(scene.id)}>+ Conversation</button></div></article>)}</div>
  </div>;
}

function Playtest({ graph, snapshot, language }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; language: string }) {
  const start = graph?.nodes.find((node) => node.kind === "start"); const [currentId, setCurrentId] = useState(start?.id ?? ""); const [pathIds, setPathIds] = useState<string[]>([]);
  const initialConditions = useMemo(() => Object.fromEntries(snapshot.variables.map((variable) => [variable.name, variable.initialValue])), [snapshot.variables]);
  const [conditionValues, setConditionValues] = useState<Record<string, string | number | boolean>>(initialConditions);
  useEffect(() => { setCurrentId(start?.id ?? ""); setPathIds([]); }, [graph?.id, start?.id]);
  useEffect(() => { setConditionValues(initialConditions); }, [initialConditions]);
  if (!graph || !start) return <div className="workspace-empty">Select a conversation to playtest.</div>;
  const current = graph.nodes.find((node) => node.id === currentId) ?? start; const outgoing = graph.links.filter((link) => link.originNodeId === current.id).sort((a, b) => a.priority - b.priority);
  const choose = (id: string) => { setPathIds((value) => [...value, current.id]); setCurrentId(id); };
  const speaker = current.speakerCharacterId ? snapshot.characters.find((character) => character.id === current.speakerCharacterId)?.name : "";
  return <div className="playtest"><aside><h3>Run conditions</h3>{snapshot.variables.map((variable) => <label key={variable.id}>{variable.name}<input type={variable.type === "boolean" ? "checkbox" : variable.type === "number" ? "number" : "text"} checked={variable.type === "boolean" ? Boolean(conditionValues[variable.name]) : undefined} value={variable.type !== "boolean" ? String(conditionValues[variable.name] ?? "") : undefined} onChange={(event) => setConditionValues((values) => ({ ...values, [variable.name]: variable.type === "boolean" ? event.target.checked : variable.type === "number" ? Number(event.target.value) : event.target.value }))} /></label>)}<h3>Path</h3>{pathIds.map((id, index) => <button key={`${id}-${index}`} onClick={() => { setCurrentId(id); setPathIds((value) => value.slice(0, index)); }}>{graph.nodes.find((node) => node.id === id)?.lineId}</button>)}</aside>
    <main><p className="eyebrow">Text-only run · {graph.title}</p><div className="play-line"><span>{speaker}</span><p>{current.kind === "start" ? "Begin conversation" : current.texts.find((value) => value.language === language)?.text || "No text"}</p></div><div className="choices">{outgoing.map((link) => { const target = graph.nodes.find((node) => node.id === link.destinationNodeId); const condition = evaluatePlaytestCondition(target?.conditions ?? "", conditionValues); return <button key={link.id} disabled={!condition.allowed} onClick={() => { if (condition.allowed) choose(link.destinationNodeId); }}><span>{target?.texts.find((value) => value.language === language)?.menuText || target?.texts.find((value) => value.language === language)?.text || "Continue"}</span>{target?.conditions && <small>{condition.supported ? condition.allowed ? "Condition met" : "Gated" : "Unsupported condition"} · {target.conditions}</small>}</button>; })}{outgoing.length === 0 && <div className="end-marker">End of path</div>}</div><button className="reset" onClick={() => { setCurrentId(start.id); setPathIds([]); }}>Restart</button></main></div>;
}

function Translation({ graph, snapshot, primary, secondary, onSelect }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; primary: string; secondary: string; onSelect(id: string): void }) {
  if (!graph) return <div className="workspace-empty">Select a conversation to translate.</div>;
  return <div className="translation"><header><div><p className="eyebrow">Coverage matrix</p><h2>{graph.title}</h2></div><span>{graph.nodes.filter((node) => node.kind !== "start" && node.kind !== "group").length} authored lines</span></header><div className="translation-grid"><div className="tr-head">Line / speaker</div>{snapshot.project.languages.map((language) => <div className={`tr-head ${language === primary || language === secondary ? "active" : ""}`} key={language}>{language.toUpperCase()}</div>)}
    {graph.nodes.filter((node) => node.kind !== "start" && node.kind !== "group").flatMap((node) => [<button className="tr-key" key={`${node.id}-key`} onClick={() => onSelect(node.id)}><code>{node.lineId}</code><span>{snapshot.characters.find((character) => character.id === node.speakerCharacterId)?.name ?? "Unassigned"}</span></button>, ...snapshot.project.languages.map((language) => { const value = node.texts.find((text) => text.language === language); return <button className={`tr-cell ${value?.text ? "covered" : "missing"}`} key={`${node.id}-${language}`} onClick={() => onSelect(node.id)}>{value?.text || `Missing ${language}`}<small>{value?.verificationStatus === "native-verified" ? "✓ Native verified" : "Unverified"}</small></button>; })])}</div></div>;
}

interface CharacterDraft {
  name: string;
  displayNames: Record<string, string>;
  isPlayer: boolean;
  portraitPath: string;
  description: string;
  actorNotes: string;
  voiceNotes: string;
}

function characterDraft(character?: CharacterRecord): CharacterDraft {
  return character ? {
    name: character.name, displayNames: character.displayNames, isPlayer: character.isPlayer,
    portraitPath: character.portraitPath ?? "", description: character.description,
    actorNotes: character.actorNotes, voiceNotes: character.voiceNotes,
  } : { name: "", displayNames: {}, isPlayer: false, portraitPath: "", description: "", actorNotes: "", voiceNotes: "" };
}

function CharacterFields({ value, languages, autoFocus, onChange }: { value: CharacterDraft; languages: string[]; autoFocus?: boolean; onChange(value: CharacterDraft): void }) {
  const update = <Key extends keyof CharacterDraft>(key: Key, next: CharacterDraft[Key]) => onChange({ ...value, [key]: next });
  return <><div className="metadata-grid"><label>Character name<input autoFocus={autoFocus} value={value.name} required maxLength={120} onChange={(event) => update("name", event.target.value)} /></label><label className="checkbox-label"><input type="checkbox" checked={value.isPlayer} onChange={(event) => update("isPlayer", event.target.checked)} /> Player character</label></div>
    <label>Character description<textarea rows={3} maxLength={8000} value={value.description} onChange={(event) => update("description", event.target.value)} /></label>
    <div className="metadata-grid">{languages.map((language) => <label key={language}>Display name · {language.toUpperCase()}<input value={value.displayNames[language] ?? ""} maxLength={200} onChange={(event) => update("displayNames", { ...value.displayNames, [language]: event.target.value })} /></label>)}</div>
    <div className="metadata-grid"><label>Actor direction<textarea rows={3} maxLength={8000} value={value.actorNotes} onChange={(event) => update("actorNotes", event.target.value)} /></label><label>Voice notes<textarea rows={3} maxLength={8000} value={value.voiceNotes} onChange={(event) => update("voiceNotes", event.target.value)} /></label></div>
    <label>Local portrait path<input value={value.portraitPath} maxLength={1000} placeholder="Optional file path" onChange={(event) => update("portraitPath", event.target.value)} /></label></>;
}

function CharacterCreateDialog({ languages, projectVersion, onClose, onCreated }: { languages: string[]; projectVersion: number; onClose(): void; onCreated(): Promise<void> }) {
  const [draft, setDraft] = useState<CharacterDraft>(() => characterDraft());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const { name, displayNames, isPlayer, portraitPath, description, actorNotes, voiceNotes } = draft;
    try {
      setSaving(true); setError("");
      await window.reed.mutate("upsertCharacter", { name, displayNames, isPlayer, portraitPath: portraitPath.trim() || null, description, actorNotes, voiceNotes, expectedVersion: projectVersion, source: "human" });
      await onCreated(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <div className="prompt-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}><form className="prompt-dialog character-create-dialog metadata-form" role="dialog" aria-modal="true" aria-labelledby="character-create-title" onSubmit={(event) => void save(event)} onKeyDown={(event) => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); onClose(); } }}>
    <header><p className="eyebrow">Cast registry</p><h2 id="character-create-title">Add character details</h2><p>Create the complete cast record now. You can still edit every field later.</p></header>
    <CharacterFields value={draft} languages={languages} autoFocus onChange={setDraft} />
    {error && <div className="error-banner" role="alert">{error}</div>}
    <div className="prompt-actions"><button type="button" onClick={onClose}>Cancel</button><button className="primary" type="submit" disabled={saving || !draft.name.trim()}>{saving ? "Creating…" : "Create character"}</button></div>
  </form></div>;
}

function CharacterEditor({ character, languages, projectVersion, lineCount, open, onOpen, onClose, onSaved }: { character: CharacterRecord; languages: string[]; projectVersion: number; lineCount: number; open: boolean; onOpen(): void; onClose(): void; onSaved(): Promise<void> }) {
  const [draft, setDraft] = useState<CharacterDraft>(() => characterDraft(character));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setDraft(characterDraft(character)); setError(""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const { name, displayNames, isPlayer, portraitPath, description, actorNotes, voiceNotes } = draft;
    try {
      setSaving(true); setError("");
      await window.reed.mutate("upsertCharacter", { id: character.id, name, displayNames, isPlayer, portraitPath: portraitPath.trim() || null, description, actorNotes, voiceNotes, expectedVersion: projectVersion, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <article className={`character-card ${open ? "editing" : ""}`}>
    <div className="avatar">{character.name.slice(0, 2).toUpperCase()}</div>
    <div className="character-content"><div className="registry-card-heading"><div><h3>{character.name}{character.isPlayer && <span>Player</span>}</h3><p>{character.description || "No character description"}</p><small>Actor ID {character.numericId} · {lineCount} lines</small></div><button type="button" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button></div>
      {open && <form className="metadata-form" onSubmit={(event) => void save(event)}>
        <CharacterFields value={draft} languages={languages} autoFocus onChange={setDraft} />
        {error && <div className="error-banner" role="alert">{error}</div>}
        <div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving || !draft.name.trim()}>{saving ? "Saving…" : "Save character"}</button></div>
      </form>}
    </div>
  </article>;
}

function VariableEditor({ variable, projectVersion, open, onOpen, onClose, onSaved }: { variable: VariableRecord; projectVersion: number; open: boolean; onOpen(): void; onClose(): void; onSaved(): Promise<void> }) {
  const initialEditorValue = () => variable.type === "boolean" ? Boolean(variable.initialValue) : String(variable.initialValue);
  const [type, setType] = useState<VariableRecord["type"]>(variable.type);
  const [initialValue, setInitialValue] = useState<string | boolean>(initialEditorValue);
  const [description, setDescription] = useState(variable.description);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const reset = () => { setType(variable.type); setInitialValue(initialEditorValue()); setDescription(variable.description); setError(""); };
  const changeType = (next: VariableRecord["type"]) => { setType(next); setInitialValue(next === "boolean" ? false : next === "number" ? "0" : ""); };
  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const parsedInitialValue = type === "boolean" ? Boolean(initialValue) : type === "number" ? Number(initialValue) : String(initialValue);
    if (type === "number" && (String(initialValue).trim() === "" || !Number.isFinite(parsedInitialValue))) { setError("Enter a valid number."); return; }
    try {
      setSaving(true); setError("");
      await window.reed.mutate("declareVariable", { name: variable.name, type, initialValue: parsedInitialValue, description, expectedVersion: projectVersion, source: "human" });
      await onSaved(); onClose();
    } catch (value) { setError(message(value)); } finally { setSaving(false); }
  };
  return <article className={`variable-card ${open ? "editing" : ""}`}><div className="registry-card-heading"><div><code>{variable.name}</code><span>{variable.type} · ID {variable.numericId}</span>{variable.description && <p>{variable.description}</p>}</div><button type="button" onClick={open ? () => { reset(); onClose(); } : onOpen}>{open ? "Cancel" : "Edit"}</button></div>
    {open && <form className="metadata-form" onSubmit={(event) => void save(event)}><div className="metadata-grid"><label>Variable name<input value={variable.name} readOnly aria-readonly="true" /></label><label>Type<select value={type} onChange={(event) => changeType(event.target.value as VariableRecord["type"])}><option value="boolean">Boolean</option><option value="number">Number</option><option value="text">Text</option></select></label></div>
      <label>Initial value{type === "boolean" ? <span className="checkbox-control"><input type="checkbox" checked={Boolean(initialValue)} onChange={(event) => setInitialValue(event.target.checked)} />{Boolean(initialValue) ? "True" : "False"}</span> : <input type={type === "number" ? "number" : "text"} value={String(initialValue)} onChange={(event) => setInitialValue(event.target.value)} />}</label>
      <label>Variable description<textarea rows={3} maxLength={2000} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
      {error && <div className="error-banner" role="alert">{error}</div>}
      <div className="metadata-actions"><button type="button" onClick={() => { reset(); onClose(); }}>Cancel</button><button className="primary" type="submit" disabled={saving}>{saving ? "Saving…" : "Save variable"}</button></div>
    </form>}
  </article>;
}

function Characters({ snapshot, refresh }: { snapshot: ProjectSnapshot; refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [creatingCharacter, setCreatingCharacter] = useState(false);
  const [editingCharacterId, setEditingCharacterId] = useState<string | null>(null);
  const [editingVariableName, setEditingVariableName] = useState<string | null>(null);
  const add = () => setCreatingCharacter(true);
  const addVariable = async () => { const name = await prompt({ title: "Add variable", label: "Variable name", confirmLabel: "Choose type" }); if (!name) return; const requested = await prompt({ title: `Set type for ${name}`, label: "Variable type", confirmLabel: "Create variable", options: [{ value: "boolean", label: "Boolean" }, { value: "number", label: "Number" }, { value: "text", label: "Text" }] }); if (!requested) return; const initialValue = requested === "boolean" ? false : requested === "number" ? 0 : ""; const result = await window.reed.mutate("declareVariable", { name, type: requested, initialValue, description: "", expectedVersion: snapshot.project.version, source: "human" }) as { value?: { name?: string } }; await refresh(); if (result.value?.name) setEditingVariableName(result.value.name); };
  const usage = (id: string) => snapshot.conversations.reduce((total, conversation) => total + conversation.nodes.filter((node) => node.speakerCharacterId === id).length, 0);
  return <div className="characters"><header><div><p className="eyebrow">Cast registry</p><h2>Characters</h2></div><button className="primary" onClick={add}>Add character</button></header><div className="character-list">{snapshot.characters.map((character) => <CharacterEditor key={`${character.id}-${character.updatedAt}`} character={character} languages={snapshot.project.languages} projectVersion={snapshot.project.version} lineCount={usage(character.id)} open={editingCharacterId === character.id} onOpen={() => setEditingCharacterId(character.id)} onClose={() => setEditingCharacterId(null)} onSaved={refresh} />)}</div><section className="variable-registry"><header><div><p className="eyebrow">Condition contract</p><h2>Declared variables</h2></div><button onClick={() => void addVariable()}>Add variable</button></header>{snapshot.variables.length ? <div>{snapshot.variables.map((variable) => <VariableEditor key={`${variable.id}-${variable.updatedAt}`} variable={variable} projectVersion={snapshot.project.version} open={editingVariableName === variable.name} onOpen={() => setEditingVariableName(variable.name)} onClose={() => setEditingVariableName(null)} onSaved={refresh} />)}</div> : <p>No variables declared.</p>}</section>{creatingCharacter && <CharacterCreateDialog languages={snapshot.project.languages} projectVersion={snapshot.project.version} onClose={() => setCreatingCharacter(false)} onCreated={refresh} />}</div>;
}

function Validation({ report, onJump }: { report: ValidationReport; onJump(issue: ValidationIssue): void }) {
  const [severity, setSeverity] = useState<"all" | "error" | "warning">("all"); const issues = report.issues.filter((issue) => severity === "all" || issue.severity === severity);
  return <div className="validation"><header><div><p className="eyebrow">Preflight</p><h2>{report.valid ? "Ready to export" : `${report.errors} errors need attention`}</h2></div><div className="segmented"><button className={severity === "all" ? "active" : ""} onClick={() => setSeverity("all")}>All {report.issues.length}</button><button className={severity === "error" ? "active" : ""} onClick={() => setSeverity("error")}>Errors {report.errors}</button><button className={severity === "warning" ? "active" : ""} onClick={() => setSeverity("warning")}>Warnings {report.warnings}</button></div></header><div className="issue-list">{issues.map((issue, index) => <button key={`${issue.code}-${issue.lineId}-${index}`} onClick={() => onJump(issue)}><span className={`severity ${issue.severity}`}>{issue.severity === "error" ? "!" : "△"}</span><div><code>{issue.code}</code><p>{issue.message}</p><small>{[issue.lineId, issue.language].filter(Boolean).join(" · ")}</small></div><em>Jump →</em></button>)}</div></div>;
}

function Review({ refresh }: { refresh(): Promise<void> }) {
  const prompt = usePrompt();
  const [changes, setChanges] = useState<MutationRecord[]>([]); useEffect(() => { void window.reed.getReviewDiff().then(setChanges); }, []);
  const approve = async () => { const label = await prompt({ title: "Approve review", label: "Snapshot name", description: "This records the current reviewed state locally.", confirmLabel: "Approve & snapshot" }); if (!label) return; await window.reed.mutate("approveReview", { label }); setChanges([]); await refresh(); };
  return <div className="review"><header><div><p className="eyebrow">Since last approval</p><h2>{changes.length ? `${changes.length} changes to review` : "Review inbox is clear"}</h2></div>{changes.length > 0 && <button className="primary" onClick={() => void approve()}>Approve & snapshot</button>}</header><div className="change-list">{changes.map((change) => <article key={change.sequence}><span>{change.sequence}</span><div><code>{change.operation}</code><p>{JSON.stringify(change.changes, null, 2)}</p><small>{change.source} · v{change.baseVersion} → v{change.newVersion}</small></div></article>)}</div></div>;
}

function Production({ snapshot }: { snapshot: ProjectSnapshot }) {
  const [result, setResult] = useState(""); const wordCount = (characterId: string) => snapshot.conversations.flatMap((conversation) => conversation.nodes).filter((node) => node.speakerCharacterId === characterId).flatMap((node) => node.texts.filter((text) => text.language === snapshot.project.defaultLanguage)).reduce((sum, text) => sum + (text.text.trim() ? text.text.trim().split(/\s+/u).length : 0), 0);
  const run = async (kind: Parameters<typeof window.reed.export>[0]) => { try { setResult(JSON.stringify(await window.reed.export(kind), null, 2)); } catch (value) { setResult(message(value)); } };
  return <div className="production"><header><div><p className="eyebrow">Recording & handoff</p><h2>Voice production</h2></div><div><button onClick={() => void run("voice")}>Export voice package</button><button className="primary" onClick={() => void run("pixel-single")}>Export for Unity</button></div></header><table><thead><tr><th>Character</th><th>Lines</th><th>Words</th><th>Est. minutes</th></tr></thead><tbody>{snapshot.characters.map((character) => { const words = wordCount(character.id); const lines = snapshot.conversations.flatMap((conversation) => conversation.nodes).filter((node) => node.speakerCharacterId === character.id).length; return <tr key={character.id}><td>{character.name}</td><td>{lines}</td><td>{words}</td><td>{(words / 150).toFixed(1)}</td></tr>; })}</tbody></table><div className="export-actions"><button onClick={() => void run("project")}>Project JSON</button><button onClick={() => void run("pixel-partitioned")}>Split Unity databases</button><button onClick={() => void run("screenplay")}>Screenplay Markdown</button></div>{result && <pre className="result-log">{result}</pre>}</div>;
}

function ReadView({ snapshot }: { snapshot: ProjectSnapshot }) {
  return <div className="read-view"><header><p className="eyebrow">Golden path</p><h1>{snapshot.project.name}</h1><p>Linear table-read view · {snapshot.project.defaultLanguage.toUpperCase()}</p></header>{snapshot.conversations.map((conversation) => <section key={conversation.id}><h2>{conversation.title}</h2>{conversation.nodes.filter((node) => node.kind !== "start" && node.kind !== "group").map((node) => <div className="script-line" key={node.id}><strong>{snapshot.characters.find((character) => character.id === node.speakerCharacterId)?.name ?? "Unassigned"}</strong><p>{node.texts.find((text) => text.language === snapshot.project.defaultLanguage)?.text || "—"}</p><code>{node.lineId}</code></div>)}</section>)}</div>;
}

function EditorApp() {
  const [state, setState] = useState<EditorBootstrap | null>(null); const [workspace, setWorkspace] = useState<Workspace>("graph");
  const [conversationId, setConversationId] = useState<string | null>(null); const [graph, setGraph] = useState<ConversationGraph | null>(null); const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [primary, setPrimary] = useState("en"); const [secondary, setSecondary] = useState("el"); const [search, setSearch] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [notice, setNotice] = useState("All changes saved locally");
  const [navigatorOpen, setNavigatorOpen] = useState(desktopPanelLayout); const [inspectorOpen, setInspectorOpen] = useState(desktopPanelLayout);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false); const workspaceMenuRef = useRef<HTMLDivElement>(null);
  const workspaceMenuTriggerRef = useRef<HTMLButtonElement>(null); const workspaceMenuItemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  useEffect(() => { void window.reed.getBootstrap().then((value) => { if (value) { setState(value); setPrimary(value.snapshot.project.defaultLanguage); setSecondary(value.snapshot.project.languages.find((language) => language !== value.snapshot.project.defaultLanguage) ?? value.snapshot.project.defaultLanguage); setConversationId(value.snapshot.conversations[0]?.id ?? null); } }); }, []);
  const loadConversation = useCallback(async (id: string | null) => { if (!id) { setGraph(null); return; } const value = await window.reed.getConversation(id); setGraph(value); setSelectedNodeId((current) => value.nodes.some((node) => node.id === current) ? current : value.nodes.find((node) => node.kind !== "start")?.id ?? value.nodes[0]?.id ?? null); }, []);
  useEffect(() => { void loadConversation(conversationId); }, [conversationId, loadConversation]);
  const refresh = useCallback(async () => { const next = await window.reed.getBootstrap(); if (next) { setState(next); if (conversationId) await loadConversation(conversationId); } }, [conversationId, loadConversation]);
  useEffect(() => { if (!state) return; const timer = window.setInterval(async () => { const changes = await window.reed.getChanges(state.lastChangeSequence); if (changes.length) { setNotice(`${changes.length} external change${changes.length === 1 ? "" : "s"} loaded`); await refresh(); } }, 1400); return () => window.clearInterval(timer); }, [state?.lastChangeSequence, refresh]);
  useEffect(() => {
    const media = window.matchMedia(desktopPanelMedia);
    const syncPanels = (event: MediaQueryListEvent) => { setNavigatorOpen(event.matches); setInspectorOpen(event.matches); };
    media.addEventListener("change", syncPanels);
    return () => media.removeEventListener("change", syncPanels);
  }, []);
  useEffect(() => { const listener = (event: KeyboardEvent) => {
    if (event.key === "Escape") { setNavigatorOpen(false); setInspectorOpen(false); setWorkspaceMenuOpen(false); return; }
    const shortcut = globalShortcut(event.key, event.metaKey || event.ctrlKey);
    if (!shortcut) return;
    event.preventDefault();
    if (shortcut === "toggle-project") { setNavigatorOpen((value) => !value); if (!desktopPanelLayout()) setInspectorOpen(false); setWorkspaceMenuOpen(false); return; }
    setWorkspace(shortcut); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } setWorkspaceMenuOpen(false);
  }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!workspaceMenuRef.current?.contains(event.target as HTMLElement)) setWorkspaceMenuOpen(false); };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [workspaceMenuOpen]);
  if (!state) return <Welcome onReady={(value) => { setState(value); setPrimary(value.snapshot.project.defaultLanguage); setSecondary(value.snapshot.project.languages.find((language) => language !== value.snapshot.project.defaultLanguage) ?? value.snapshot.project.defaultLanguage); setConversationId(value.snapshot.conversations[0]?.id ?? null); }} />;
  const snapshot = state.snapshot; const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const chooseWorkspace = (id: Workspace) => { setWorkspace(id); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } setWorkspaceMenuOpen(false); };
  const chooseConversation = (id: string) => { setConversationId(id); setWorkspace("graph"); if (!desktopPanelLayout()) { setNavigatorOpen(false); setInspectorOpen(false); } };
  const selectNode = (id: string) => { setSelectedNodeId(id); setInspectorOpen(true); };
  const focusWorkspaceMenuItem = (index: number) => window.requestAnimationFrame(() => workspaceMenuItemRefs.current[index]?.focus());
  const openWorkspaceMenu = (index: number) => { setWorkspaceMenuOpen(true); focusWorkspaceMenuItem(index); };
  const jumpIssue = (issue: ValidationIssue) => { if (issue.conversationId) setConversationId(issue.conversationId); setWorkspace("graph"); if (!desktopPanelLayout()) setNavigatorOpen(false); window.setTimeout(() => { const node = graph?.nodes.find((candidate) => candidate.lineId === issue.lineId); if (node) { setSelectedNodeId(node.id); setInspectorOpen(true); } }, 100); };
  const doSearch = async () => { setResults(search.trim() ? await window.reed.findLines({ query: search }) : []); };
  return <div className={`app-shell ${navigatorOpen ? "navigator-open" : "navigator-closed"} ${inspectorOpen ? "inspector-open" : "inspector-closed"}`}>
    <header className="command-bar">
      <div className="brand"><img src={reedLogo} alt="" /><b>Reed</b><i /><em>{snapshot.project.name}</em></div>
      <div className="workspace-navigation">
        <div className="workspace-tabs" aria-label="Authoring workspaces">{primaryWorkspaces.map((item) => <button key={item.id} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspace(item.id)}>{item.label}<kbd>⌘{item.key}</kbd></button>)}</div>
        <div className="workspace-more" ref={workspaceMenuRef}>
          <button ref={workspaceMenuTriggerRef} className={`workspace-more-trigger ${secondaryWorkspaceGroups.some((group) => group.items.some((item) => item.id === workspace)) ? "active" : ""}`} aria-haspopup="menu" aria-controls="workspace-more-menu" aria-expanded={workspaceMenuOpen} aria-label="More workspaces" onClick={() => setWorkspaceMenuOpen((value) => !value)} onKeyDown={(event) => { if (["Enter", " ", "ArrowDown", "ArrowUp"].includes(event.key)) { event.preventDefault(); openWorkspaceMenu(event.key === "ArrowUp" ? secondaryWorkspaces.length - 1 : 0); } }}>More<span aria-hidden="true">⌄</span></button>
          <div id="workspace-more-menu" className={`workspace-menu ${workspaceMenuOpen ? "open" : ""}`} role="menu" aria-label="More workspaces" aria-hidden={!workspaceMenuOpen}>
            {secondaryWorkspaceGroups.map((group) => <div className="workspace-menu-section" key={group.label} role="group" aria-label={group.label}><span className="workspace-menu-label">{group.label}</span>{group.items.map((item) => { const itemIndex = secondaryWorkspaceIndex.get(item.id) ?? 0; return <button ref={(element) => { workspaceMenuItemRefs.current[itemIndex] = element; }} key={item.id} role="menuitem" tabIndex={workspaceMenuOpen ? 0 : -1} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspace(item.id)} onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setWorkspaceMenuOpen(false); workspaceMenuTriggerRef.current?.focus(); return; } const next = nextMenuIndex(itemIndex, secondaryWorkspaces.length, event.key); if (next !== null) { event.preventDefault(); focusWorkspaceMenuItem(next); } }}><span>{item.label}</span><kbd>⌘{item.key}</kbd></button>; })}</div>)}
          </div>
        </div>
      </div>
      <div className="command-actions"><div className="search"><span>⌕</span><input value={search} aria-label="Search dialogue" placeholder="Text, Line ID, tag…" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void doSearch(); }} />{results.length > 0 && <div className="search-results">{results.map((result) => <button key={`${result.lineId}-${result.language}`} onClick={() => { chooseConversation(result.conversationId); setResults([]); }}>{result.text}<small>{result.lineId} · {result.language}</small></button>)}</div>}</div><button className="save-button" onClick={() => void window.reed.mutate("createBackup", { label: "Manual" }).then(() => setNotice("Named backup saved"))}>Save version</button><button className="export-button" onClick={() => chooseWorkspace("production")}>Export</button></div>
    </header>
    {!navigatorOpen && (desktopPanelLayout() || !inspectorOpen) && <button className="panel-restore project" aria-controls="project-navigator" aria-expanded="false" aria-label="Open project navigator" title="Open Project navigator (⌘K)" onClick={() => { setNavigatorOpen(true); if (!desktopPanelLayout()) setInspectorOpen(false); }}>Project<kbd>⌘K</kbd></button>}
    {(workspace === "graph" || workspace === "translation") && graph && !inspectorOpen && (desktopPanelLayout() || !navigatorOpen) && <button className="panel-restore inspector" aria-controls="line-inspector" aria-expanded="false" aria-label="Open line inspector" title="Open Inspector" onClick={() => { setInspectorOpen(true); if (!desktopPanelLayout()) setNavigatorOpen(false); }}>Inspector</button>}
    <Navigator snapshot={snapshot} selectedConversationId={conversationId} open={navigatorOpen} onConversation={chooseConversation} onScene={() => chooseWorkspace("beats")} onClose={() => setNavigatorOpen(false)} />
    <main className="workspace">{workspace === "graph" && <GraphWorkspace graph={graph} snapshot={snapshot} selectedNodeId={selectedNodeId} onSelect={selectNode} onMutated={refresh} primary={primary} secondary={secondary} />}{workspace === "beats" && <BeatMap snapshot={snapshot} onConversation={chooseConversation} refresh={refresh} />}{workspace === "playtest" && <Playtest graph={graph} snapshot={snapshot} language={primary} />}{workspace === "translation" && <Translation graph={graph} snapshot={snapshot} primary={primary} secondary={secondary} onSelect={selectNode} />}{workspace === "characters" && <Characters snapshot={snapshot} refresh={refresh} />}{workspace === "validation" && <Validation report={state.validation} onJump={jumpIssue} />}{workspace === "review" && <Review refresh={refresh} />}{workspace === "production" && <Production snapshot={snapshot} />}{workspace === "read" && <ReadView snapshot={snapshot} />}</main>
    {(workspace === "graph" || workspace === "translation") && graph && <Inspector graph={graph} node={selectedNode} primary={primary} secondary={secondary} languages={snapshot.project.languages} characters={snapshot.characters} open={inspectorOpen} onMutated={refresh} onClose={() => setInspectorOpen(false)} />}
    {(navigatorOpen || inspectorOpen) && <button className="panel-scrim" aria-label="Close open panel" onClick={() => { setNavigatorOpen(false); setInspectorOpen(false); }} />}
    <footer className="status-bar"><span><i className={state.validation.valid ? "ok" : "bad"} />{state.validation.valid ? "Validation clear" : `${state.validation.errors} errors`}</span><span>{notice}</span><span>{state.root}</span><div className="language-switch"><select value={primary} onChange={(event) => setPrimary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select><button aria-label="Swap primary and reference languages" onClick={() => { setPrimary(secondary); setSecondary(primary); }}>⇄</button><select value={secondary} onChange={(event) => setSecondary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select></div></footer>
  </div>;
}

export function App() { return <PromptProvider><EditorApp /></PromptProvider>; }
