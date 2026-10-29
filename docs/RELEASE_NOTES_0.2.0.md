# Reed 0.2.0

Reed is now an open-source, offline-first narrative design and production workspace for branching games.

## What is in this release

- Visual branching dialogue with live node dragging, marquee selection, connector drop-to-create, focal zoom, and trackpad, touch, mouse, keyboard, and pen input.
- Line, Choice, and Junction nodes with permanent Line IDs, character context, variables, conditions, scripts, status, pronunciation, and performance direction.
- Read, playtest, validation, review snapshots, deterministic history, backups, autosave, and a clear saved indicator.
- Character, variable, beat, scene, conversation, translation, production, and voice-recording workflows.
- A broad game-language catalog and localized authoring, including English, Greek, Griko, Italian, German, CJK scripts, right-to-left languages, and custom language tags.
- Engine and interchange exports for Unity Localization, Godot, Unreal String Tables, Yarn Spinner, gettext PO, XLIFF 2.0, JSON, CSV, screenplay, Pixel Crushers, and voice production.
- Actor PDFs, studio PDFs, XLSX recording trackers, CSV manifests, exact Line ID filenames, and pickup/rework handling.
- Optional in-app Git and GitHub collaboration with branches, push/fetch, pull requests, review, and merge—disabled by default and never synchronized in the background.
- Local CLI and stdio MCP support for external agents, plus explicit, expiring Android Remote Agent Access.
- Native Android tablet support tested around the Daylight DC-1, including keyboard, mouse, trackpad, Wacom EMR hover, barrel-button marquee, and responsive collapsible panes.
- Automatic, Light, and Dark appearance modes on desktop and Android.

## Fixes since 0.1.9

- Restoring a backup keeps your backup history and saves a "Before restore" snapshot first; desktop History can now restore snapshots.
- Pixel Crushers export writes typed variables, Localization fields, and VoiceOverFile entrytags for Unity.
- Yarn Spinner export now includes playable `.yarn` scripts, not just strings tables.
- Android: pulling no longer overwrites edits made since the last checkpoint, and editing Final text sends it back to Rework.
- Remote Agent Access no longer drops requests on flaky connections.
- Hardened agent export paths, Git remote handling, and the packaged desktop app.

## Trust model

Reed needs no account and keeps project data on the device. Opening, writing, saving, backing up, validating, playtesting, and exporting make no network requests. Network access is limited to Git/GitHub actions the user explicitly starts and explicit, time-limited Android Remote Agent Access sessions.

## Compatibility

- macOS: Apple silicon
- Windows: Windows 10 and 11, x64
- Android: Android 13 or newer; tablet-first, tested on Daylight DC-1

Reed remains pre-1.0 software. Keep project backups and validate generated output against the exact engine, localization, and production toolchain used by your game.
