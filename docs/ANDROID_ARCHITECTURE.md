# Reed Android architecture

Reed Android is a native Kotlin/Jetpack Compose application. It is not an Electron wrapper or a WebView: the desktop renderer, Electron IPC, Node filesystem APIs, `better-sqlite3`, and child-process GitHub CLI are not available on Android.

## Modules

```text
apps/android/app
  Compose tablet UI, adaptive layout, keyboard/mouse input, ViewModel
            │
            ├───────────────┬──────────────────┐
            ▼               ▼                  ▼
apps/android/core       apps/android/git    apps/android/remote
  Reed domain boundary    isolated JGit transport
  SQLite/WAL canonical    Android Keystore token handoff
  versions + history      explicit actions only
  deterministic export          │             isolated HTTPS long poll
            │                    ▼                  │
            ▼                Git remote             ▼
   app-private reed.sqlite
            │
            ▼
   exports/reed-project.json
```

`com.reed.core.ReedCore` is the Android platform implementation of the `@reed/core` boundary. Compose and the Git adapter cannot issue SQL or construct canonical project JSON. Core owns validation, transactions, IDs, versions, mutation records, import, and deterministic export.

## Data and parity contract

- SQLite is canonical and enables WAL before use.
- `reed-project` format version 1 is shared with desktop. Export timestamps remain `null`, records have stable ordering, and display-name maps are sorted.
- A Git clone or fast-forward pull is validated and imported through Core. The JSON file is never treated as a live second database.
- Each local content mutation checks `expectedVersion`, increments the project version, and appends a mutation record in the same transaction.
- Line IDs and numeric allocations are monotonic within the imported history. Deletion never resets an allocator.
- Editing recorded, processed, or final voice text returns voice status to `rework`.
- Delete requires confirmation in the UI and the matching permanent Line ID in Core.
- English, Greek, Italian, German, and Griko are round-tripped in the Android Core tests.

## Git safety model

The `git` module is the only Android runtime module with a Git network transport. The separate `remote` module owns the optional Remote Agent HTTPS transport; neither transport is active by default.

- No repository action is run during launch, open, edit, autosave, navigation, or when the Git screen opens.
- Status is local. Clone, Fetch, Pull, Push, and Sync are visible user actions.
- Checkpoint writes the deterministic export through Core, stages only that export, and creates a local commit without networking.
- Pull accepts fast-forward only. Push never force-pushes. A diverged history is reported and left intact.
- HTTPS cleartext is disabled. A private-repository token is encrypted by Android Keystore and is never put in SQLite, the export, Git config, or logs.
- Android system cloud backup and device-transfer extraction are explicitly disabled; project movement remains a deliberate Reed export or Git action.
- A repository remains an ordinary local clone under app-private storage. Local editing continues when offline or signed out.

## Remote Agent Access safety model

The optional `remote` module is the only non-Git Android HTTP client. A visible, confirmed Agent workspace action starts `RemoteAgentService` as a `specialUse` foreground service for eight hours. Its persistent notification names the project and exposes Disconnect. The service opens an outbound authenticated long poll to a configured public Reed relay; it does not listen on the tablet.

The relay forwards stateless Streamable HTTP MCP JSON-RPC requests and holds them only in memory. Android dispatches the allowlisted MCP tools into `ReedCore` with mutation source `agent`. Git, arbitrary files, raw SQL, shell execution, and model credentials are not exposed. Agent mutations require optimistic versions, cannot promote text above Polished, cannot alter Final node metadata, and require exact Line ID confirmation for deletion. The service uses `START_NOT_STICKY`, so process death, Force stop, Active-apps Stop, or reboot revokes access rather than silently restoring it.

## Daylight interaction model

The shell adapts instead of scaling a desktop screenshot. Landscape normally shows navigator, graph, and inspector. Portrait and split-screen collapse panels in that order. The canvas uses opaque surfaces, high-contrast borders, minimal animation, and text/icon labels so grayscale never removes meaning.

Hardware input is part of the main path:

- Tab/Shift+Tab and arrow keys use Compose focus traversal;
- Ctrl/Command+K opens commands;
- Ctrl/Command+S opens a local checkpoint when Git is connected;
- Ctrl/Command+Shift+P pushes after a checkpoint;
- Delete opens line confirmation;
- Escape closes transient UI;
- two-finger trackpad or mouse-wheel input pans the graph;
- Ctrl/Command+wheel zooms;
- node movement previews at pointer rate and writes once at drag end.
- Wacom EMR proximity is handled at the canvas boundary; only hover/barrel events are claimed, while pen contact, drag, touch, wheel, and trackpad streams remain with Compose.
- a barrel-button contact drag takes exclusive ownership for marquee selection, immediately removing node, link, and canvas-pan recognizers until release.
- the primary barrel action selects the hovered node and the secondary/right-click action opens Edit, Start link, and Delete commands. Delete still requires confirmation.

Stylus feedback uses a border change plus an explicit `PEN HOVER`/`ERASER HOVER` label, so it remains legible on the grayscale display and is not encoded by color alone. Hover targets reserve a 44dp action area and never change the node's measured height. Reed leaves palm rejection and handwriting dispatch to Sol:OS rather than installing a competing gesture filter.

## Verification

`core` tests cover deterministic Unicode round trips, optimistic concurrency, voice rework, and confirmed deletion. `git` tests create a local bare repository and exercise checkpoint/push without network. Remote and app tests cover relay URL hardening, Android MCP Unicode mutations and guardrails, pen hit testing, and the foreground-service boundary. The offline-boundary test rejects general network clients outside the Git and Remote Agent modules. Android lint and a debug APK build are release gates, followed by a real-device DC-1 pass for launch, rotation, split-screen, touch, keyboard, mouse, trackpad, stylus hover/barrel/eraser, suspend/resume, background Claude access, and offline restart.

Connected Gradle tests are additionally gated by `-PallowDeviceDataReset=true` because Android's instrumentation lifecycle may replace the debug package and erase its local app data. The opt-in is reserved for disposable devices or user profiles; assembling a test APK remains ungated.

The build targets API 36 while retaining min API 33 for the Android 13-based DC-1. AndroidX Core 1.18 and Lifecycle 2.10 are deliberately pinned to their API-36-compatible lines; their next releases require API 37 / Android Gradle Plugin 9.1. Lint exclusions name only those compatibility pins and JGit's dependency-owned, unused no-check trust-manager class. Reed's HTTPS path uses the Android platform trust store.
