# Reed

Reed is an offline-first branching-dialogue workstation for Unity projects using Pixel Crushers Dialogue System. It combines a visual Electron editor for macOS, a native Android tablet editor, a local stdio MCP server for external agents, a scriptable CLI, and platform SQLite/WAL core implementations that share one deterministic project contract.

The application is fully useful without a network connection and has no Reed account, telemetry, updater, cloud project storage, remote asset, or embedded LLM client. An external agent may contact its own configured model endpoint, then call Reed locally through MCP or the CLI. Optional GitHub collaboration is disabled per project until a user turns it on; even then, Reed connects only when the user presses a GitHub action. Android also has explicit, expiring Remote Agent Access for Claude mobile through a separately deployed transient relay.

## What is included

- Dense React Flow graph editing with line, choice, group, and cross-conversation links; any two configured languages side by side; per-line spoken-language selection; permanent Line IDs; protected Final content; and text-only playtest.
- Native Mac menus, persisted Dark/Light/Automatic appearance, an in-app project home with recent local projects, versioned project settings, project navigator, beat map, cast and variable registries, global local search, translation coverage, validation dashboard, review snapshots, read view, voice budget, and hot reload of CLI/MCP mutations.
- SQLite WAL storage, migrations, optimistic concurrency, append-only mutation history, autosave with a visible save state, rolling and named backups, exact-confirmation restore/delete operations, and deterministic project JSON.
- Optional offline Git checkpoints and local story branches for team review. Pressing **Saved** opens the local-history and GitHub sync center for setup, connection status, repository connection, fetch, and push; the full opt-in GitHub workspace adds repository creation, branches, pull-request creation, review, and merge—without requiring Terminal. Reed stores no GitHub token and performs no background synchronization.
- Pixel Crushers single- or multi-database JSON with stable actor, variable, conversation, and entry IDs; persisted Base ID ranges; localized fields; cross-database links; canvas positions; Lua/Sequence fields; and Line-ID audio manifest.
- Unicode actor PDF, editable studio CSV/XLSX, screenplay Markdown, and word/minute budget exports for English, Greek, Italian, German, and Griko.
- MCP tools and CLI commands backed exclusively by `@reed/core`, with agent status limits and stale-write protection.
- A native Kotlin/Compose Android workspace for the Daylight DC-1 with a grayscale-safe adaptive layout, hardware keyboard/mouse/trackpad controls, Android 13 compatibility, and explicit HTTPS Git clone/checkpoint/fetch/pull/push backed by Android Keystore.
- An opt-in Android foreground MCP bridge for Claude mobile, with a persistent Disconnect notification, encrypted connector capability, guarded ReedCore tools, no Git exposure, and an in-memory self-hostable relay.

## Install and verify

Reed currently targets Node 22+ and pnpm 11. Dependency installation is the development/build step that may use a network. Once built, the app, data, backups, MCP, CLI, and exports run offline. GitHub features remain optional and require a connection only for the action the user requests.

### Download the Mac app

Download the latest Apple-silicon DMG from the [Reed releases page](https://github.com/is2b007/Reed/releases/latest), open it, and drag **Reed** into Applications. Reed is locally signed but not yet Apple-notarized. If macOS says it cannot verify Reed, close the alert, then Control-click **Reed.app** in Applications, choose **Open**, and confirm **Open** once. After that, Reed opens normally.

The GitHub repository is the source-code project. The DMG and ZIP on the releases page are the installable app; opening the repository page itself will not launch Reed.

```sh
pnpm install
CI=true pnpm typecheck
CI=true pnpm test
CI=true pnpm test:offline
```

Build the reusable runtime packages:

```sh
CI=true pnpm build:runtime
```

Build the local macOS application bundle:

```sh
CI=true pnpm --filter @reed/editor package
```

The locally signed development app is written to `apps/editor/out/Reed-darwin-arm64/Reed.app`. The Mac package bundles the GitHub CLI when it is available on the build machine, so users do not need to install or run command-line tools. Apple Developer signing and notarization require the distributor's certificate and credentials.

Build the Android debug APK after installing Android SDK API 36 and accepting Google's Android SDK license terms:

```sh
pnpm android:test
pnpm android:lint
pnpm android:build
```

The APK is written to `apps/android/app/build/outputs/apk/debug/app-debug.apk`; the current verified DC-1 debug build is also available locally at `dist/Reed-Android-DC1-debug.apk`. See [Android and Daylight DC-1 setup](docs/ANDROID_DC1.md) for install, input, pen hover, offline, Git, checksum, and device-verification instructions.

## Start using Reed

Create a project from the desktop welcome screen, or create one from the CLI:

```sh
CI=true pnpm reed init ./my-story --name "My Story" --slug my-story --languages en,el,it,de,griko --default-language en
CI=true pnpm reed --project ./my-story add-scene "Opening" --slug opening
CI=true pnpm reed --project ./my-story --help
```

The spec-compatible `dialogue` prefix is accepted too:

```sh
CI=true pnpm reed --project ./my-story dialogue validate
```

For the MCP server, build the runtime packages and configure the external agent to start:

```sh
node /absolute/path/to/Reed/apps/mcp/dist/index.js --project /absolute/path/to/my-story
```

Transport is stdio only. Reed does not listen on a port.

## Source of truth and local files

SQLite is canonical. A project folder contains:

```text
my-story/
  .reed/
    reed.sqlite       canonical database
    reed.sqlite-wal   SQLite write-ahead log while open
    backups/          rolling and named SQLite snapshots
  exports/
    reed-project.json deterministic Git-readable snapshot
    pixel-crushers/   Unity JSON and audio manifests
    voice/            Studio PDF, per-actor PDFs, XLSX tracker, and CSV
    screenplay.md
```

Unity JSON is one-way generated output and is stamped `GENERATED — DO NOT HAND-EDIT`. Never make Unity's Dialogue Editor a second source of truth; make changes in Reed and export again.

## Documentation

- [Data model and graph contract](docs/DATA_MODEL.md)
- [CLI reference](docs/CLI.md)
- [MCP tool reference](docs/MCP.md)
- [MCP setup for humans](docs/MCP_SETUP.md)
- [MCP operating playbook for AI agents](docs/AI_MCP_PLAYBOOK.md)
- [Pixel Crushers export and Unity import](docs/PIXEL_CRUSHERS.md)
- [Local history and optional GitHub collaboration](docs/PROJECT_HISTORY.md)
- [Voice production handoff](docs/VOICE_PRODUCTION.md)
- [Offline contract and release acceptance](docs/OFFLINE_CONTRACT.md)
- [Architecture and completion plan](docs/BUILD_PLAN.md)
- [Editor design rationale](docs/EDITOR_DESIGN.md)
- [Visual research](docs/VISUAL_REFERENCES.md)
- [Product design system](DESIGN.md)
- [Android and Daylight DC-1 setup](docs/ANDROID_DC1.md)
- [Android architecture and parity contract](docs/ANDROID_ARCHITECTURE.md)
- [Remote MCP from Claude Android](docs/REMOTE_MCP_ANDROID.md)

## Compatibility boundary

The exporter follows the documented Pixel Crushers DialogueDatabase shape and has deterministic automated coverage for localized fields, stable IDs, Base ID collision prevention, cross-links, Unicode, and manifests. A real Unity-authored Pixel Crushers fixture has not been supplied to this repository, so a Unity import/export round trip and version-specific localized-field mapping must be verified before calling a particular Pixel Crushers/Unity version certified. See the fixture checklist in [docs/PIXEL_CRUSHERS.md](docs/PIXEL_CRUSHERS.md).
