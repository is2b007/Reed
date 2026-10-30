# Reed 0.2.2

Larger, consistent text on desktop and Android, plus usability fixes found testing on the Daylight DC-1.

## Text and layout

- **One type scale everywhere.** The smallest text is now 11px on desktop and 12sp on Android, with clear steps for labels, captions and body text. See `docs/TYPE_SCALE.md`.
- Line IDs in Translate keep their number visible when shortened, and lines without source text say "No source text".
- In narrow desktop windows the folded Project and Inspector tabs sit at the edges instead of covering the graph, and the project path in the status bar ends with "…".

## Android

- Back closes the command palette.
- Junction and Edit have their own icons, the selected node has a thicker border, and connection ports are larger circles.
- Missing translations show "⚠ Missing" in bold.
- New project no longer opens the keyboard straight away, and the disabled Create project button is easier to see.
- Agent Access shows session expiry and last request in your local time.
- Debug builds install as "Reed Debug" next to the release app.

## Updating

From 0.2.1, use **Check for Updates** on desktop. Android installs over 0.2.1 directly.
