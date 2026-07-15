import React, { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Background, BackgroundVariant, Controls, Handle, MiniMap, Position, ReactFlow,
  type Connection, type Edge, type Node, type NodeProps,
} from "@xyflow/react";
import type {
  CharacterRecord, ConversationGraph, DialogueNodeRecord, MutationRecord, ProjectSnapshot,
  SearchResult, ValidationIssue, ValidationReport,
} from "@reed/core";
import type { EditorBootstrap, MutationName } from "./contract.js";
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
  return <nav className={`navigator ${open ? "panel-open" : ""}`} aria-label="Project navigator">
    <div className="panel-title"><span>Project</span><kbd>⌘K</kbd><button className="panel-close" aria-label="Close project navigator" onClick={onClose}>×</button></div>
    <div className="project-name"><i />{snapshot.project.name}</div>
    {snapshot.levels.map((level) => <div className="tree-level" key={level.id}><div className="tree-heading">⌄ {level.name}</div>
      {snapshot.scenes.filter((scene) => scene.levelId === level.id).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    </div>)}
    {snapshot.scenes.filter((scene) => !scene.levelId).map((scene) => <SceneTree key={scene.id} sceneId={scene.id} snapshot={snapshot} selected={selectedConversationId} onConversation={onConversation} onScene={onScene} />)}
    {snapshot.scenes.length === 0 && <div className="panel-empty">No scenes yet.<br />Create the first beat from Beat map.</div>}
  </nav>;
}

function SceneTree({ sceneId, snapshot, selected, onConversation, onScene }: { sceneId: string; snapshot: ProjectSnapshot; selected: string | null; onConversation(id: string): void; onScene(id: string): void }) {
  const scene = snapshot.scenes.find((candidate) => candidate.id === sceneId);
  if (!scene) return null;
  return <div className="tree-scene"><button className="tree-heading scene" onClick={() => onScene(scene.id)}>⌄ {scene.name}<small>{scene.beatRef}</small></button>
    {snapshot.conversations.filter((conversation) => conversation.sceneId === scene.id).map((conversation) => <button key={conversation.id} className={`tree-conversation ${selected === conversation.id ? "active" : ""}`} onClick={() => onConversation(conversation.id)}><span>↳</span>{conversation.title}<em>v{conversation.version}</em></button>)}
  </div>;
}

function Inspector({ graph, node, primary, secondary, languages, characters, open, onMutated, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord | null; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onClose(): void }) {
  if (!node) return <aside className={`inspector ${open ? "panel-open" : ""}`}><div className="panel-title"><span>Inspector</span><button className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div><div className="panel-empty">Select a line to edit its text, production state, and logic.</div></aside>;
  return <InspectorForm key={`${node.id}-${node.updatedAt}`} graph={graph} node={node} primary={primary} secondary={secondary} languages={languages} characters={characters} open={open} onMutated={onMutated} onClose={onClose} />;
}

function InspectorForm({ graph, node, primary, secondary, languages, characters, open, onMutated, onClose }: { graph: ConversationGraph; node: DialogueNodeRecord; primary: string; secondary: string; languages: string[]; characters: CharacterRecord[]; open: boolean; onMutated(): Promise<void>; onClose(): void }) {
  const [primaryText, setPrimaryText] = useState(node.texts.find((value) => value.language === primary)?.text ?? "");
  const [secondaryText, setSecondaryText] = useState(node.texts.find((value) => value.language === secondary)?.text ?? "");
  const [conditions, setConditions] = useState(node.conditions); const [sequence, setSequence] = useState(node.sequence);
  const [script, setScript] = useState(node.userScript); const [context, setContext] = useState(node.contextComment);
  const [voiceComment, setVoiceComment] = useState(node.voiceComment); const [tags, setTags] = useState(node.tags.join(", "));
  const [error, setError] = useState("");
  const mutate = async (name: MutationName, input: Record<string, unknown>) => {
    try { setError(""); await window.reed.mutate(name, { ...input, expectedVersion: graph.version, source: "human" }); await onMutated(); }
    catch (value) { setError(message(value)); }
  };
  const forceRework = () => node.lineStatus === "final" ? window.confirm("This line is Final. Reopen it for rework?") : false;
  return <aside className={`inspector ${open ? "panel-open" : ""}`}>
    <div className="panel-title"><span>Line inspector</span><span className={`dot status-${node.lineStatus}`} /><button className="panel-close" aria-label="Close inspector" onClick={onClose}>×</button></div>
    <section><div className="inspector-id">{node.lineId}<button onClick={() => navigator.clipboard.writeText(node.lineId)}>Copy</button></div>
      <div className="field-grid"><label>Speaker<select value={node.speakerCharacterId ?? ""} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, speakerCharacterId: event.target.value || null, force: forceRework() })}><option value="">Unassigned</option>{characters.map((character) => <option key={character.id} value={character.id}>{character.name}</option>)}</select></label>
      <label>Text status<select value={node.lineStatus} onChange={(event) => void mutate("setLineStatus", { lineId: node.lineId, status: event.target.value, force: event.target.value === "final" ? window.confirm("Mark this line Final?") : false })}>{["placeholder", "draft", "polished", "edited", "final", "rework"].map((status) => <option key={status}>{status}</option>)}</select></label>
      <label>Spoken language<select value={node.spokenLanguage} onChange={(event) => void mutate("updateNode", { lineId: node.lineId, spokenLanguage: event.target.value, force: forceRework() })}>{languages.map((language) => <option key={language} value={language}>{language.toUpperCase()}</option>)}</select></label></div>
    </section>
    {node.kind !== "start" && node.kind !== "group" && <section><label className="language-label"><span>{primary.toUpperCase()} · primary</span><textarea rows={5} value={primaryText} onChange={(event) => setPrimaryText(event.target.value)} onBlur={() => void mutate("setNodeText", { lineId: node.lineId, language: primary, text: primaryText, force: forceRework() })} /></label>
      <label className="language-label secondary"><span>{secondary.toUpperCase()} · reference</span><textarea rows={4} value={secondaryText} onChange={(event) => setSecondaryText(event.target.value)} onBlur={() => void mutate("setNodeText", { lineId: node.lineId, language: secondary, text: secondaryText, force: forceRework() })} /></label></section>}
    <details open><summary>Logic & sequence</summary><label>Conditions<textarea rows={3} className="code" value={conditions} onChange={(event) => setConditions(event.target.value)} /></label><label>Sequence<textarea rows={2} className="code" value={sequence} onChange={(event) => setSequence(event.target.value)} /></label><label>User script<textarea rows={2} className="code" value={script} onChange={(event) => setScript(event.target.value)} /></label><button onClick={() => void mutate("updateNode", { lineId: node.lineId, conditions, sequence, userScript: script, force: forceRework() })}>Save logic</button></details>
    <details><summary>Voice context</summary><label>Context<textarea rows={3} value={context} onChange={(event) => setContext(event.target.value)} /></label><label>Performance direction<textarea rows={3} value={voiceComment} onChange={(event) => setVoiceComment(event.target.value)} /></label><label>Tags<input value={tags} onChange={(event) => setTags(event.target.value)} /></label><button onClick={() => void mutate("updateNode", { lineId: node.lineId, contextComment: context, voiceComment, tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean), force: forceRework() })}>Save context</button></details>
    {node.kind !== "start" && <button className="danger-action" onClick={() => { const confirmation = window.prompt(`Type ${node.lineId} to delete this line.`); if (confirmation) void mutate("deleteNode", { lineId: node.lineId, confirmation, force: node.lineStatus === "final" }); }}>Delete line…</button>}
    {error && <div className="error-banner">{error}</div>}
  </aside>;
}

function GraphWorkspace({ graph, snapshot, selectedNodeId, onSelect, onMutated, primary, secondary }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; selectedNodeId: string | null; onSelect(id: string): void; onMutated(): Promise<void>; primary: string; secondary: string }) {
  const characters = useMemo(() => new Map(snapshot.characters.map((character) => [character.id, character.name])), [snapshot.characters]);
  const pathIds = useMemo(() => {
    const ids = new Set<string>(); if (!graph || !selectedNodeId) return ids;
    const start = graph.nodes.find((node) => node.kind === "start"); if (!start) return ids;
    const parent = new Map<string, string>(); const queue = [start.id]; const seen = new Set(queue);
    while (queue.length) { const origin = queue.shift(); if (!origin) break; for (const edge of graph.links.filter((link) => link.originNodeId === origin)) if (!seen.has(edge.destinationNodeId)) { seen.add(edge.destinationNodeId); parent.set(edge.destinationNodeId, origin); queue.push(edge.destinationNodeId); } }
    let current: string | undefined = selectedNodeId; while (current) { ids.add(current); current = parent.get(current); } return ids;
  }, [graph, selectedNodeId]);
  const nodes = useMemo<CardNode[]>(() => graph?.nodes.map((node) => ({ id: node.id, type: "dialogue", position: { x: node.x, y: node.y }, selected: node.id === selectedNodeId,
    data: { record: node, speaker: node.speakerCharacterId ? characters.get(node.speakerCharacterId) ?? "Unknown" : "Unassigned", primary: node.texts.find((value) => value.language === primary)?.text ?? "", secondary: node.texts.find((value) => value.language === secondary)?.text ?? "", onPath: pathIds.has(node.id) },
  })) ?? [], [graph, selectedNodeId, characters, primary, secondary, pathIds]);
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
  const removeEdge = async (deleted: Edge[]) => {
    if (!graph || deleted.length === 0) return;
    const edge = deleted[0]; const link = graph.links.find((value) => value.id === edge?.id); if (!link) return;
    const touchesFinal = graph.nodes.some((node) => (node.id === link.originNodeId || node.id === link.destinationNodeId) && node.lineStatus === "final");
    if (!window.confirm(touchesFinal ? "This link touches Final content. Remove it and reopen the affected flow?" : "Remove this dialogue link?")) return;
    await window.reed.mutate("unlinkNodes", { linkId: link.id, expectedVersion: graph.version, source: "human", force: touchesFinal }); await onMutated();
  };
  if (!graph) return <div className="workspace-empty"><h2>Select a conversation</h2><p>The graph, playtest, and translation workspaces follow the same selection.</p></div>;
  return <div className="graph-workspace"><div className="graph-tools"><span>Add</span><button onClick={() => void add("line")}>Line</button><button onClick={() => void add("choice")}>Choice</button><button onClick={() => void add("group")}>Junction</button><small>Select a link and press Delete to unlink</small></div><ReactFlow<CardNode> nodes={nodes} edges={edges} nodeTypes={nodeTypes} fitView minZoom={0.2} maxZoom={1.8} onNodeClick={(_event, node) => onSelect(node.id)} onConnect={(value) => void connect(value)} onEdgesDelete={(value) => void removeEdge(value)} onNodeDragStop={(_event, moved) => { const record = graph.nodes.find((node) => node.id === moved.id); if (record) void window.reed.mutate("updateNode", { lineId: record.lineId, x: moved.position.x, y: moved.position.y, expectedVersion: graph.version, source: "human", force: false }).then(onMutated); }}>
    <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#334038" /><Controls position="bottom-right" /><MiniMap pannable zoomable nodeColor={(node) => pathIds.has(node.id) ? "#b6cb78" : "#344139"} /></ReactFlow></div>;
}

function BeatMap({ snapshot, onConversation, refresh }: { snapshot: ProjectSnapshot; onConversation(id: string): void; refresh(): Promise<void> }) {
  const addScene = async () => { const name = window.prompt("Scene name"); if (!name) return; await window.reed.mutate("createScene", { name, slug: name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, ""), beatRef: "", sortOrder: snapshot.scenes.length, source: "human" }); await refresh(); };
  const addConversation = async (sceneId: string) => { const title = window.prompt("Conversation title"); if (!title) return; const result = await window.reed.mutate("createConversation", { sceneId, title, description: "", source: "human" }) as { value?: { id?: string } }; await refresh(); if (result.value?.id) onConversation(result.value.id); };
  return <div className="beat-map"><header><div><p className="eyebrow">Story structure</p><h2>Beat map</h2></div><button className="primary" onClick={() => void addScene()}>Add scene</button></header>
    <div className="beat-track">{snapshot.scenes.map((scene, index) => <article key={scene.id}><span className="beat-index">{String(index + 1).padStart(2, "0")}</span><div><h3>{scene.name}</h3><p>{scene.beatRef || "No Obsidian beat reference"}</p>{snapshot.conversations.filter((conversation) => conversation.sceneId === scene.id).map((conversation) => <button key={conversation.id} onClick={() => onConversation(conversation.id)}>{conversation.title}<em>{conversation.nodes.length - 1} lines</em></button>)}<button className="add-inline" onClick={() => void addConversation(scene.id)}>+ Conversation</button></div></article>)}</div>
  </div>;
}

function Playtest({ graph, snapshot, language }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; language: string }) {
  const start = graph?.nodes.find((node) => node.kind === "start"); const [currentId, setCurrentId] = useState(start?.id ?? ""); const [pathIds, setPathIds] = useState<string[]>([]);
  useEffect(() => { setCurrentId(start?.id ?? ""); setPathIds([]); }, [graph?.id, start?.id]);
  if (!graph || !start) return <div className="workspace-empty">Select a conversation to playtest.</div>;
  const current = graph.nodes.find((node) => node.id === currentId) ?? start; const outgoing = graph.links.filter((link) => link.originNodeId === current.id).sort((a, b) => a.priority - b.priority);
  const choose = (id: string) => { setPathIds((value) => [...value, current.id]); setCurrentId(id); };
  const speaker = current.speakerCharacterId ? snapshot.characters.find((character) => character.id === current.speakerCharacterId)?.name : "";
  return <div className="playtest"><aside><h3>Run conditions</h3>{snapshot.variables.map((variable) => <label key={variable.id}>{variable.name}<input type={variable.type === "boolean" ? "checkbox" : "text"} defaultChecked={variable.type === "boolean" ? Boolean(variable.initialValue) : undefined} defaultValue={variable.type !== "boolean" ? String(variable.initialValue) : undefined} /></label>)}<h3>Path</h3>{pathIds.map((id, index) => <button key={`${id}-${index}`} onClick={() => { setCurrentId(id); setPathIds((value) => value.slice(0, index)); }}>{graph.nodes.find((node) => node.id === id)?.lineId}</button>)}</aside>
    <main><p className="eyebrow">Text-only run · {graph.title}</p><div className="play-line"><span>{speaker}</span><p>{current.kind === "start" ? "Begin conversation" : current.texts.find((value) => value.language === language)?.text || "No text"}</p></div><div className="choices">{outgoing.map((link) => { const target = graph.nodes.find((node) => node.id === link.destinationNodeId); return <button key={link.id} onClick={() => choose(link.destinationNodeId)}><span>{target?.texts.find((value) => value.language === language)?.menuText || target?.texts.find((value) => value.language === language)?.text || "Continue"}</span>{target?.conditions && <small>Gated · {target.conditions}</small>}</button>; })}{outgoing.length === 0 && <div className="end-marker">End of path</div>}</div><button className="reset" onClick={() => { setCurrentId(start.id); setPathIds([]); }}>Restart</button></main></div>;
}

function Translation({ graph, snapshot, primary, secondary, onSelect }: { graph: ConversationGraph | null; snapshot: ProjectSnapshot; primary: string; secondary: string; onSelect(id: string): void }) {
  if (!graph) return <div className="workspace-empty">Select a conversation to translate.</div>;
  return <div className="translation"><header><div><p className="eyebrow">Coverage matrix</p><h2>{graph.title}</h2></div><span>{graph.nodes.filter((node) => node.kind !== "start" && node.kind !== "group").length} authored lines</span></header><div className="translation-grid"><div className="tr-head">Line / speaker</div>{snapshot.project.languages.map((language) => <div className={`tr-head ${language === primary || language === secondary ? "active" : ""}`} key={language}>{language.toUpperCase()}</div>)}
    {graph.nodes.filter((node) => node.kind !== "start" && node.kind !== "group").flatMap((node) => [<button className="tr-key" key={`${node.id}-key`} onClick={() => onSelect(node.id)}><code>{node.lineId}</code><span>{snapshot.characters.find((character) => character.id === node.speakerCharacterId)?.name ?? "Unassigned"}</span></button>, ...snapshot.project.languages.map((language) => { const value = node.texts.find((text) => text.language === language); return <button className={`tr-cell ${value?.text ? "covered" : "missing"}`} key={`${node.id}-${language}`} onClick={() => onSelect(node.id)}>{value?.text || `Missing ${language}`}<small>{value?.verificationStatus === "native-verified" ? "✓ Native verified" : "Unverified"}</small></button>; })])}</div></div>;
}

function Characters({ snapshot, refresh }: { snapshot: ProjectSnapshot; refresh(): Promise<void> }) {
  const add = async () => { const name = window.prompt("Character name"); if (!name) return; await window.reed.mutate("upsertCharacter", { name, displayNames: {}, isPlayer: false, portraitPath: null, description: "", actorNotes: "", voiceNotes: "", source: "human" }); await refresh(); };
  const addVariable = async () => { const name = window.prompt("Variable name"); if (!name) return; const requested = window.prompt("Type: boolean, number, or text", "boolean"); if (!requested || !["boolean", "number", "text"].includes(requested)) return; const initialValue = requested === "boolean" ? false : requested === "number" ? 0 : ""; await window.reed.mutate("declareVariable", { name, type: requested, initialValue, description: "", source: "human" }); await refresh(); };
  const usage = (id: string) => snapshot.conversations.reduce((total, conversation) => total + conversation.nodes.filter((node) => node.speakerCharacterId === id).length, 0);
  return <div className="characters"><header><div><p className="eyebrow">Cast registry</p><h2>Characters</h2></div><button className="primary" onClick={() => void add()}>Add character</button></header><div className="character-list">{snapshot.characters.map((character) => <article key={character.id}><div className="avatar">{character.name.slice(0, 2).toUpperCase()}</div><div><h3>{character.name}{character.isPlayer && <span>Player</span>}</h3><p>{character.description || "No character description"}</p><small>Actor ID {character.numericId} · {usage(character.id)} lines</small></div></article>)}</div><section className="variable-registry"><header><div><p className="eyebrow">Condition contract</p><h2>Declared variables</h2></div><button onClick={() => void addVariable()}>Add variable</button></header>{snapshot.variables.length ? <div>{snapshot.variables.map((variable) => <article key={variable.id}><code>{variable.name}</code><span>{variable.type}</span><strong>{JSON.stringify(variable.initialValue)}</strong><small>ID {variable.numericId}</small></article>)}</div> : <p>No variables declared.</p>}</section></div>;
}

function Validation({ report, onJump }: { report: ValidationReport; onJump(issue: ValidationIssue): void }) {
  const [severity, setSeverity] = useState<"all" | "error" | "warning">("all"); const issues = report.issues.filter((issue) => severity === "all" || issue.severity === severity);
  return <div className="validation"><header><div><p className="eyebrow">Preflight</p><h2>{report.valid ? "Ready to export" : `${report.errors} errors need attention`}</h2></div><div className="segmented"><button className={severity === "all" ? "active" : ""} onClick={() => setSeverity("all")}>All {report.issues.length}</button><button className={severity === "error" ? "active" : ""} onClick={() => setSeverity("error")}>Errors {report.errors}</button><button className={severity === "warning" ? "active" : ""} onClick={() => setSeverity("warning")}>Warnings {report.warnings}</button></div></header><div className="issue-list">{issues.map((issue, index) => <button key={`${issue.code}-${issue.lineId}-${index}`} onClick={() => onJump(issue)}><span className={`severity ${issue.severity}`}>{issue.severity === "error" ? "!" : "△"}</span><div><code>{issue.code}</code><p>{issue.message}</p><small>{[issue.lineId, issue.language].filter(Boolean).join(" · ")}</small></div><em>Jump →</em></button>)}</div></div>;
}

function Review({ refresh }: { refresh(): Promise<void> }) {
  const [changes, setChanges] = useState<MutationRecord[]>([]); useEffect(() => { void window.reed.getReviewDiff().then(setChanges); }, []);
  const approve = async () => { const label = window.prompt("Name this approved snapshot"); if (!label) return; await window.reed.mutate("approveReview", { label }); setChanges([]); await refresh(); };
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

export function App() {
  const [state, setState] = useState<EditorBootstrap | null>(null); const [workspace, setWorkspace] = useState<Workspace>("graph");
  const [conversationId, setConversationId] = useState<string | null>(null); const [graph, setGraph] = useState<ConversationGraph | null>(null); const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [primary, setPrimary] = useState("en"); const [secondary, setSecondary] = useState("el"); const [search, setSearch] = useState(""); const [results, setResults] = useState<SearchResult[]>([]); const [notice, setNotice] = useState("All changes saved locally");
  const [navigatorOpen, setNavigatorOpen] = useState(false); const [inspectorOpen, setInspectorOpen] = useState(false);
  const [workspaceMenuOpen, setWorkspaceMenuOpen] = useState(false); const workspaceMenuRef = useRef<HTMLDivElement>(null);
  useEffect(() => { void window.reed.getBootstrap().then((value) => { if (value) { setState(value); setPrimary(value.snapshot.project.defaultLanguage); setSecondary(value.snapshot.project.languages.find((language) => language !== value.snapshot.project.defaultLanguage) ?? value.snapshot.project.defaultLanguage); setConversationId(value.snapshot.conversations[0]?.id ?? null); } }); }, []);
  const loadConversation = useCallback(async (id: string | null) => { if (!id) { setGraph(null); return; } const value = await window.reed.getConversation(id); setGraph(value); setSelectedNodeId((current) => value.nodes.some((node) => node.id === current) ? current : value.nodes.find((node) => node.kind !== "start")?.id ?? value.nodes[0]?.id ?? null); }, []);
  useEffect(() => { void loadConversation(conversationId); }, [conversationId, loadConversation]);
  const refresh = useCallback(async () => { const next = await window.reed.getBootstrap(); if (next) { setState(next); if (conversationId) await loadConversation(conversationId); } }, [conversationId, loadConversation]);
  useEffect(() => { if (!state) return; const timer = window.setInterval(async () => { const changes = await window.reed.getChanges(state.lastChangeSequence); if (changes.length) { setNotice(`${changes.length} external change${changes.length === 1 ? "" : "s"} loaded`); await refresh(); } }, 1400); return () => window.clearInterval(timer); }, [state?.lastChangeSequence, refresh]);
  useEffect(() => { const listener = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && /^[1-9]$/.test(event.key)) { const match = workspaces.find((value) => value.key === event.key); if (match) { event.preventDefault(); setWorkspace(match.id); setNavigatorOpen(false); setInspectorOpen(false); setWorkspaceMenuOpen(false); } } }; window.addEventListener("keydown", listener); return () => window.removeEventListener("keydown", listener); }, []);
  useEffect(() => {
    if (!workspaceMenuOpen) return;
    const closeOutside = (event: PointerEvent) => { if (!workspaceMenuRef.current?.contains(event.target as HTMLElement)) setWorkspaceMenuOpen(false); };
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") setWorkspaceMenuOpen(false); };
    window.addEventListener("pointerdown", closeOutside); window.addEventListener("keydown", closeOnEscape);
    return () => { window.removeEventListener("pointerdown", closeOutside); window.removeEventListener("keydown", closeOnEscape); };
  }, [workspaceMenuOpen]);
  if (!state) return <Welcome onReady={(value) => { setState(value); setPrimary(value.snapshot.project.defaultLanguage); setSecondary(value.snapshot.project.languages.find((language) => language !== value.snapshot.project.defaultLanguage) ?? value.snapshot.project.defaultLanguage); setConversationId(value.snapshot.conversations[0]?.id ?? null); }} />;
  const snapshot = state.snapshot; const selectedNode = graph?.nodes.find((node) => node.id === selectedNodeId) ?? null;
  const chooseWorkspace = (id: Workspace) => { setWorkspace(id); setNavigatorOpen(false); setInspectorOpen(false); setWorkspaceMenuOpen(false); };
  const chooseConversation = (id: string) => { setConversationId(id); setWorkspace("graph"); setNavigatorOpen(false); setInspectorOpen(false); };
  const selectNode = (id: string) => { setSelectedNodeId(id); setInspectorOpen(true); };
  const jumpIssue = (issue: ValidationIssue) => { if (issue.conversationId) setConversationId(issue.conversationId); setWorkspace("graph"); setNavigatorOpen(false); window.setTimeout(() => { const node = graph?.nodes.find((candidate) => candidate.lineId === issue.lineId); if (node) { setSelectedNodeId(node.id); setInspectorOpen(true); } }, 100); };
  const doSearch = async () => { setResults(search.trim() ? await window.reed.findLines({ query: search }) : []); };
  return <div className="app-shell">
    <header className="command-bar">
      <div className="brand"><img src={reedLogo} alt="" /><b>Reed</b><i /><em>{snapshot.project.name}</em></div>
      <div className="compact-panel-actions"><button className={navigatorOpen ? "active" : ""} aria-expanded={navigatorOpen} onClick={() => { setNavigatorOpen((value) => !value); setInspectorOpen(false); }}>Project</button>{(workspace === "graph" || workspace === "translation") && graph && <button className={inspectorOpen ? "active" : ""} aria-expanded={inspectorOpen} onClick={() => { setInspectorOpen((value) => !value); setNavigatorOpen(false); }}>Inspector</button>}</div>
      <div className="workspace-navigation">
        <div className="workspace-tabs" aria-label="Authoring workspaces">{primaryWorkspaces.map((item) => <button key={item.id} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspace(item.id)}>{item.label}<kbd>⌘{item.key}</kbd></button>)}</div>
        <div className="workspace-more" ref={workspaceMenuRef}>
          <button className={`workspace-more-trigger ${secondaryWorkspaceGroups.some((group) => group.items.some((item) => item.id === workspace)) ? "active" : ""}`} aria-haspopup="menu" aria-expanded={workspaceMenuOpen} aria-label="More workspaces" onClick={() => setWorkspaceMenuOpen((value) => !value)}>More<span aria-hidden="true">⌄</span></button>
          <div className={`workspace-menu ${workspaceMenuOpen ? "open" : ""}`} role="menu" aria-label="More workspaces" aria-hidden={!workspaceMenuOpen}>
            {secondaryWorkspaceGroups.map((group) => <div className="workspace-menu-section" key={group.label} role="group" aria-label={group.label}><span className="workspace-menu-label">{group.label}</span>{group.items.map((item) => <button key={item.id} role="menuitem" tabIndex={workspaceMenuOpen ? 0 : -1} className={workspace === item.id ? "active" : ""} aria-current={workspace === item.id ? "page" : undefined} onClick={() => chooseWorkspace(item.id)}><span>{item.label}</span><kbd>⌘{item.key}</kbd></button>)}</div>)}
          </div>
        </div>
      </div>
      <div className="command-actions"><div className="search"><span>⌕</span><input value={search} aria-label="Search dialogue" placeholder="Text, Line ID, tag…" onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void doSearch(); }} />{results.length > 0 && <div className="search-results">{results.map((result) => <button key={`${result.lineId}-${result.language}`} onClick={() => { chooseConversation(result.conversationId); setResults([]); }}>{result.text}<small>{result.lineId} · {result.language}</small></button>)}</div>}</div><button className="save-button" onClick={() => void window.reed.mutate("createBackup", { label: "Manual" }).then(() => setNotice("Named backup saved"))}>Save version</button><button className="export-button" onClick={() => chooseWorkspace("production")}>Export</button></div>
    </header>
    <Navigator snapshot={snapshot} selectedConversationId={conversationId} open={navigatorOpen} onConversation={chooseConversation} onScene={() => chooseWorkspace("beats")} onClose={() => setNavigatorOpen(false)} />
    <main className="workspace">{workspace === "graph" && <GraphWorkspace graph={graph} snapshot={snapshot} selectedNodeId={selectedNodeId} onSelect={selectNode} onMutated={refresh} primary={primary} secondary={secondary} />}{workspace === "beats" && <BeatMap snapshot={snapshot} onConversation={chooseConversation} refresh={refresh} />}{workspace === "playtest" && <Playtest graph={graph} snapshot={snapshot} language={primary} />}{workspace === "translation" && <Translation graph={graph} snapshot={snapshot} primary={primary} secondary={secondary} onSelect={selectNode} />}{workspace === "characters" && <Characters snapshot={snapshot} refresh={refresh} />}{workspace === "validation" && <Validation report={state.validation} onJump={jumpIssue} />}{workspace === "review" && <Review refresh={refresh} />}{workspace === "production" && <Production snapshot={snapshot} />}{workspace === "read" && <ReadView snapshot={snapshot} />}</main>
    {(workspace === "graph" || workspace === "translation") && graph && <Inspector graph={graph} node={selectedNode} primary={primary} secondary={secondary} languages={snapshot.project.languages} characters={snapshot.characters} open={inspectorOpen} onMutated={refresh} onClose={() => setInspectorOpen(false)} />}
    {(navigatorOpen || inspectorOpen) && <button className="panel-scrim" aria-label="Close open panel" onClick={() => { setNavigatorOpen(false); setInspectorOpen(false); }} />}
    <footer className="status-bar"><span><i className={state.validation.valid ? "ok" : "bad"} />{state.validation.valid ? "Validation clear" : `${state.validation.errors} errors`}</span><span>{notice}</span><span>{state.root}</span><div className="language-switch"><select value={primary} onChange={(event) => setPrimary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select><button onClick={() => { setPrimary(secondary); setSecondary(primary); }}>⇄</button><select value={secondary} onChange={(event) => setSecondary(event.target.value)}>{snapshot.project.languages.map((language) => <option key={language}>{language}</option>)}</select></div></footer>
  </div>;
}
