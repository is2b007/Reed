# Reed visual references

## Research note

The Mobbin connector was retried on 2026-07-15. The screens below were selected only after visual inspection; they complement the public product references and are interaction references rather than templates to copy wholesale.

## Inspected Mobbin references

- [LangChain graph studio](https://mobbin.com/screens/d35078ab-34a5-434d-906d-f9550e6e5087): compact graph chrome, visible node connections, and a focused run/debug surface. Reed should use its spatial clarity while carrying much denser narrative-production metadata.
- [Airtable builder shell](https://mobbin.com/screens/25501ed5-5fa3-470d-9e8b-c04895f30740): strong left navigator, central work area, and contextual builder controls. This is the clearest shell reference for Reed's Scene → Conversation navigation.
- [Descript translation review](https://mobbin.com/screens/22310789-f2fc-4cd0-b54f-b07507971044): source and translated content remain visibly paired, with progress and review actions nearby. Reed should adapt this to dual-language line editing and native-verification state.
- [Ditto localization inspector](https://mobbin.com/screens/39ea279b-cea1-4daa-a673-eeed240412e7): a dense, practical string list with a detail inspector and status context. This supports Reed's translation table and selected-Line inspector.
- [Figma compare changes](https://mobbin.com/screens/ebb90bf9-735a-4f5f-968a-8152ff58dde8): bounded change comparison and explicit review decisions. Reed should apply this to text, metadata, and graph-edge changes.
- [GitHub files changed](https://mobbin.com/screens/72783a50-4cc2-4e3d-83f9-048f9a2455cf): navigable changed-item hierarchy and review progress. Reed's equivalent groups by Scene → Conversation → Line.

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

## Future Mobbin search briefs

Run these as separate Web screen searches, with 4–6 results each:

1. `visual workflow builder with a large node canvas, connected steps, zoom controls, and a properties inspector`
2. `desktop productivity workspace with nested project navigation tree, central editor, and right-side details inspector`
3. `localization management table with rows of source text, multiple language columns, status badges, filters, and bulk actions`
4. `review inbox showing content changes, side-by-side diff, approval actions, and version history`
5. `text-only branching playtest with dialogue choices, variable controls, and path history`

Only add further Mobbin results after inspecting the returned image. Do not infer a screen from its title or metadata alone.
