# Design System — Reed

## Product context

- **What this is:** An offline production workstation for writing, restructuring, localizing, reviewing, validating, and exporting branching game dialogue.
- **Who it is for:** Narrative designers, writers, localization reviewers, voice directors, producers, and technical narrative teams working with Unity and Pixel Crushers.
- **Project type:** Desktop editor with graph, table, review, dashboard, and playtest workspaces.
- **Memorable quality:** A complex conversation should feel inspectable and under control.

## Visual thesis

Reed should feel like a calm piece of studio equipment: compact, precise, slightly tactile, and made for hours of serious work. It should not look like a consumer writing app, a whimsical flowchart toy, or a generic SaaS dashboard.

The visual direction is **industrial editorial**. IDE-like spatial discipline supports the production density; restrained typography and a soft reed-green signal keep it from feeling sterile.

## Layout

The default shell uses four stable regions:

1. a 40px command bar with project context, mode switcher, search, save state, and export;
2. a resizable 248–320px left navigator for Project → Level → Scene → Conversation;
3. the primary workspace, usually a graph canvas, table, diff, dashboard, or read view;
4. a resizable 320–400px contextual inspector on the right.

A 24px status bar reports selection count, validation count, external-change state, save state, and zoom. Panels may collapse, but the same selected object should survive mode changes.

Use task workspaces rather than separate mini-apps: Graph, Playtest, Translation, Review, Validation, and Read. The command bar and navigator remain stable while the central surface and inspector adapt.

## Graph canvas

- Use a low-contrast 16px dot grid, with a stronger marker every 64px.
- Conversation flow defaults left-to-right so lines scan like a script and branches consume vertical space.
- Nodes use 280px default width and content-driven height. Do not make every node a uniform tile.
- Put speaker, Line ID, and status in a compact header; keep dialogue text as the visual center.
- Player choices have an inset choice rail and diamond output ports. Group nodes are compact junction bars, not empty dialogue cards.
- Show conditions on links as short labels. Full Lua remains in the inspector.
- Highlight broken links, dead ends, and cross-conversation jumpers directly on the canvas.
- At low zoom, replace body text with structural summaries rather than shrinking it into illegibility.

## Typography

Bundle font files with the application. No remote font loading.

- **UI and body:** IBM Plex Sans, 400/500/600. It is compact, readable, multilingual, and feels native to technical production work.
- **Data, IDs, conditions, and code:** IBM Plex Mono, 400/500. Use tabular numerals.
- **Long-form screenplay/read view:** Source Serif 4, 400/600. It gives prose a distinct reading surface without changing the application chrome.
- **Fallbacks:** bundled Noto Sans and Noto Serif subsets must cover every configured language and Griko characters. System fonts are fallback only.

Type scale: 11px metadata, 12px compact UI, 13px default UI/body, 15px emphasized body, 18px panel heading, 24px workspace title, 32px empty-state or onboarding title. Default line-height is 1.45 for prose and 1.25 for controls.

## Color

Dark mode is the primary art direction because Reed sits beside Unity and other production tools. A complete light theme should use the same semantic tokens.

```css
:root[data-theme="dark"] {
  --bg-app: #0e1210;
  --bg-canvas: #111613;
  --bg-panel: #171d19;
  --bg-raised: #1e2621;
  --bg-selected: #283229;
  --border-subtle: #2b352e;
  --border-strong: #465249;
  --text-primary: #eef2ec;
  --text-secondary: #b7c0b9;
  --text-muted: #818d84;
  --accent: #b6cb78;
  --accent-strong: #c9dc8d;
  --focus: #d7e6a8;
  --info: #76a9c8;
  --success: #78b58a;
  --warning: #d4aa64;
  --danger: #d7776f;
}
```

Status suggestions:

- Placeholder: neutral gray + hollow dot
- Draft: slate blue + pencil glyph
- Polished: cyan + sparkle glyph
- Edited: amber + review glyph
- Final: green + locked check
- Rework: coral + return arrow

Color is never the only signal. Pair it with a label, icon, border treatment, or pattern. Speaker colors are user-configurable accents, not semantic status colors.

## Spacing and shape

- **Base unit:** 4px.
- **Density:** compact by default, with a comfortable density preference for prose and translation views.
- **Scale:** 2, 4, 8, 12, 16, 20, 24, 32, 48, 64px.
- **Radius:** 2px controls, 4px nodes and panels, 6px dialogs. Pills are reserved for tags and status chips.
- **Borders:** 1px defines most surfaces. Use shadows only for floating menus, dragged nodes, and modals.
- **Icons:** 16px outlined icons with consistent 1.5px stroke, bundled locally.

## Motion

Motion is minimal and functional.

- 80ms for hover/focus feedback;
- 140ms for panel and menu transitions;
- 180ms for graph selection and connection feedback;
- 220ms for workspace changes.

Use ease-out for entry and ease-in for exit. Respect reduced motion. Never animate the whole graph after external updates; preserve the viewport and pulse only changed nodes.

## Workspace behavior

### Translation

Use three functional zones: a filterable line/key list, a dual-language source/target editor, and contextual QA/metadata. For broad coverage work, switch the center to a spreadsheet-like language grid. Keep frozen Line ID and speaker columns.

### Review

Treat review like a content pull request. Group changes by scene and conversation, show before/after text or link structure, allow per-change comments, and track reviewed progress. The primary terminal actions are Approve snapshot and Request rework.

### Playtest

Use a focused reading column with speaker, text, and choices. Keep variable controls and path history in side panels. A jump-back action should restore both the dialogue position and condition state.

### Validation

Lead with a severity-filtered issue list, not generic metric cards. Selecting an issue must jump to the exact node, field, language cell, variable, or Base ID range.

## Deliberate risks

1. **Dark olive rather than blue-gray chrome.** This gives Reed a recognizable material identity, but it requires careful contrast testing to avoid muddy surfaces.
2. **Dense, persistent studio panels.** This favors production speed over beginner simplicity. A first-run guided workspace and collapsible panels should absorb the learning cost.
3. **Different reading typography inside the same product.** Source Serif 4 makes screenplay passes feel intentional, but transitions between editing and reading modes must preserve location and selection.

## Anti-patterns

- no purple gradients, glassmorphism, glowing canvas effects, or decorative blobs;
- no dashboard home made from uniform metric cards;
- no color-only node taxonomy;
- no oversized rounded cards or pill buttons everywhere;
- no modal inspector for routine node editing;
- no hidden save state, backup state, validation state, or external-change state;
- no remote fonts, icons, assets, help, telemetry, or network-dependent UI.

## Decisions log

| Date | Decision | Rationale |
|---|---|---|
| 2026-07-15 | Industrial editorial direction | Fits a dense, long-session production tool and separates Reed from playful story-map editors. |
| 2026-07-15 | Dark olive primary theme | Creates a distinct but restrained identity adjacent to Unity-style tooling. |
| 2026-07-15 | Stable studio shell with task workspaces | Preserves context while users move between graph, translation, review, and validation work. |
| 2026-07-15 | All assets bundled locally | Enforces the offline product contract. |
