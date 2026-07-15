# Reed visual references

## Research note

The Mobbin connector was invoked on 2026-07-15 for node-canvas workspaces, project navigator/inspector layouts, localization tables, and review diffs. Both deep and standard searches timed out without returning screen records, so there are no defensible Mobbin screen URLs to cite yet. The exact Mobbin briefs are preserved below for a later retry.

To keep the design setup moving, the reference set uses current public product documentation and screenshots from the products themselves. These are references for interaction patterns, not templates to copy wholesale.

## 1. Arcweave: branching semantics and cross-board flow

- [Arcweave flowchart analysis](https://docs.arcweave.com/introduction/quick-tour/flowchart)
- [Arcweave connections](https://docs.arcweave.com/project-items/connections)

Borrow:

- dialogue elements and logic branches living on one legible canvas;
- labeled connections as player-choice text;
- explicit jumpers for distant or cross-conversation links;
- play mode following the graph without requiring a game build;
- character/story-object context available from the graph.

Change for Reed:

- denser node cards with production status, permanent Line ID, speaker, and language coverage;
- a persistent inspector for Lua conditions, sequence, VO context, and validation;
- no cloud collaboration language, account surfaces, or online integration assumptions;
- stronger distinction between spoken lines, player choices, groups, and cross-database links.

## 2. Twine: structural clarity at every zoom level

- [Twine story map navigation](https://twinery.org/reference/en/editing-stories/navigating.html)
- [Twine story testing](https://twinery.org/reference/en/publishing/testing.html)

Borrow:

- cards and directional links that remain understandable without opening each node;
- obvious start node, broken-link treatment, search-and-jump, pan, zoom, and fit controls;
- tag stripes and dotted/solid connection distinctions;
- test from the start or from a selected node.

Change for Reed:

- preserve manually meaningful layout but offer deterministic automatic layout after agent imports;
- use semantic summaries at low zoom rather than tiny text;
- expose validation and conditions as first-class production information;
- never let text authoring syntax silently create or delete canonical dialogue nodes.

## 3. Phrase Strings: dual-language editing with context

- [Phrase Strings Editor overview](https://support.phrase.com/hc/en-us/articles/5822638157340-Strings-Editor-Overview)
- [Phrase editor sidebar](https://support.phrase.com/hc/en-us/articles/11155533567388-Editor-Sidebar-Strings)

Borrow:

- three-zone model: searchable key list, source/target editing, contextual sidebar;
- QA, comments, screenshots/context, metadata, and suggestions staying attached to the selected line;
- batch selection and filters without leaving the editor;
- source and target text visible at the same time.

Change for Reed:

- Line ID and speaker are frozen anchors, not generic localization keys;
- one-click primary/secondary language flip on graph cards, inspector, and table;
- per-language native-verification state and saved consultant filters;
- fully local dictionaries and checks only; no machine translation, remote term base, or cloud job model.

## 4. GitHub pull-request review: approve a bounded change set

- [GitHub reviewing proposed changes](https://docs.github.com/en/pull-requests/collaborating-with-pull-requests/reviewing-changes-in-pull-requests/reviewing-proposed-changes-in-a-pull-request?tool=webui)

Borrow:

- a navigable tree of changed items;
- unified and split before/after diffs;
- mark-as-reviewed progress and comments tied to a specific change;
- one terminal review action with summary: approve or request changes.

Change for Reed:

- group changes by Scene → Conversation → Line instead of files;
- visualize graph changes as added/removed/reconnected links as well as JSON text;
- approving creates the named human snapshot that defines the next review baseline;
- show voice-rework consequences when dialogue text changed after recording.

## 5. Affinity: stable chrome, task-specific workspaces

- [Affinity workspace customization](https://affinity.help/photo2/English.lproj/pages/Workspace/customizingWorkspace.html)
- [Affinity navigator panel](https://affinity.help/publisher2/en-US.lproj/pages/Panels/navigatorPanel.html)

Borrow:

- a central document surface surrounded by docked, resizable studio panels;
- task-oriented workspaces that change relevant tools without discarding document context;
- saved zoom/view positions for large canvases;
- keyboard-mappable, compact actions and a useful status bar.

Change for Reed:

- ship one strong default layout before offering deep customization;
- preserve current scene, conversation, node, filters, and viewport across workspace switches;
- keep the navigator and inspector vocabulary narrative-specific.

## Recommended screen composition

| Reed surface | Primary reference | Reed-specific move |
|---|---|---|
| Graph editor | Arcweave + Twine | Production metadata, deterministic layouts, cross-database jumpers |
| Translation | Phrase Strings | Dual-language node cards plus a full language coverage table |
| Review inbox | GitHub review | Content and graph diffs; approval creates a backup snapshot |
| Playtest | Arcweave + Twine | Variable sandbox, gated links, path history, jump-back state |
| Validation | Phrase QA | Every issue is a jump target; no decorative dashboard cards |
| Overall shell | Affinity | Stable navigator/canvas/inspector with task workspaces |

## Mobbin retry briefs

Run these as separate Web screen searches, with 4–6 results each:

1. `visual workflow builder with a large node canvas, connected steps, zoom controls, and a properties inspector`
2. `desktop productivity workspace with nested project navigation tree, central editor, and right-side details inspector`
3. `localization management table with rows of source text, multiple language columns, status badges, filters, and bulk actions`
4. `review inbox showing content changes, side-by-side diff, approval actions, and version history`
5. `text-only branching playtest with dialogue choices, variable controls, and path history`

Only add a Mobbin result to this document after inspecting the returned image. Do not infer a screen from its title or metadata alone.
