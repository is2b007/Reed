# Reed editor design plan

## Grounding

- **Subject:** branching, multilingual game dialogue moving from draft through review, localization, voice, and Unity handoff.
- **Audience:** narrative designers, localization consultants, voice directors, and technical narrative teams working for long sessions.
- **Single job:** make the state and consequence of the currently selected branch immediately inspectable and safely editable.

## Compact token system

- **Reed black `#0e1210`:** application ground.
- **Cutting mat `#111713`:** graph and spatial work surfaces.
- **Studio olive `#182019`:** persistent panels.
- **Paper white `#eef2ec`:** primary working text.
- **Young reed `#b6cb78`:** selection, primary action, and active path.
- **Kiln coral `#d7776f`:** rework, destructive actions, and errors.
- **Type:** bundled IBM Plex Sans for chrome and editing, IBM Plex Mono for Line IDs/Lua/data, Source Serif 4 only for read mode, and bundled Noto fallbacks for Greek and Griko.
- **Shape:** 2–4px radii, hairline divisions, no ornamental cards, 4px spacing base.

## Layout studies

```text
┌ command / workspace / search / save / export ─────────────────────────────┐
├ project tree ┬ graph or task workspace ────────────────────┬ inspector ───┤
│ level        │  [line]━━[line]━━[choice]                    │ bilingual     │
│  scene       │              ┣━━[reply]                      │ production    │
│   convo      │              ┗━━[reply]                      │ logic         │
├──────────────┴ validation / external change / selection / zoom ┴──────────┤
```

The stable shell wins over a dashboard landing page because the product's value is continuous project context. Task workspaces replace the center while preserving the selected scene, conversation, line, and inspector.

## Signature: the script ribbon

The selected path is drawn as one continuous reed-colored ribbon through graph edges and node headers. The inspector repeats that path as a short bilingual before/current/after strip. This makes branching structure feel like a playable script rather than a generic automation graph, and directly supports voice-context work.

## Review against the brief

The initial idea risked becoming another dark node editor with green selection. The revision makes selection encode a narrative fact—the current playable path—and reserves Source Serif for the screenplay surface. Metric-card dashboards were removed; validation is an issue list, review is a change tree, and production totals sit in compact tables. The only expressive flourish is the script ribbon; all other chrome stays restrained.

## Interaction rules

- Keyboard focus is visible and workspace switching preserves selection.
- Canvas motion is limited to selection and connection feedback; reduced-motion disables it.
- Every error includes a direct corrective action or jump target.
- Final and destructive operations expose their confirmation requirement before execution.
- External changes pulse only the affected conversation and never reset the viewport.
- The renderer receives a narrow typed bridge and cannot access Node, SQLite, or the network.
