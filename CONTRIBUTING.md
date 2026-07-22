# Contributing to Reed

Thank you for helping build Reed. This project values small, reviewable changes that preserve authors' local data and keep the application fully useful offline.

## Before you start

Read:

1. [DESIGN.md](DESIGN.md) before changing interface behavior or appearance;
2. [ARCHITECTURE.md](ARCHITECTURE.md) before changing persistence, networking, Git, MCP, or platform boundaries; and
3. [the offline contract](docs/OFFLINE_CONTRACT.md) before adding any runtime dependency or entrypoint.

Please use an issue before starting a large feature, a data migration, a new network boundary, or a change to permanent IDs/export compatibility. Small bug fixes with a clear regression test can go directly to a pull request.

## Development setup

Required for the shared TypeScript workspace:

- Node.js `>=22.22.0`
- pnpm `11.8.0`
- Git

```sh
git clone https://github.com/is2b007/Reed.git
cd Reed
corepack enable
pnpm install --frozen-lockfile
```

Run the baseline checks:

```sh
pnpm typecheck
pnpm exec vitest run --no-file-parallelism --maxWorkers=1
pnpm test:offline
```

The serial Vitest command is the reliable full-suite form because the SQLite and local-Git fixtures can contend for CPU and filesystem time when every test file runs concurrently.

## macOS editor

The desktop application currently targets Apple silicon.

```sh
pnpm --filter @reed/editor start
```

Package a locally signed development app:

```sh
CI=true pnpm --filter @reed/editor package
```

The bundle is written to `apps/editor/out/Reed-darwin-arm64/Reed.app`. Apple distribution signing and notarization require maintainer credentials and are not part of contributor CI.

### Safe product screenshots

Build the runtime, generate a disposable project, and use Reed's hidden screenshot mode. Never capture private production data for repository documentation.

```sh
pnpm build:runtime
node scripts/create-demo.mjs /tmp/reed-demo

Reed.app/Contents/MacOS/Reed \
  --project /tmp/reed-demo \
  --screenshot /tmp/reed-graph.png \
  --screenshot-workspace graph \
  --screenshot-width 1500 \
  --screenshot-height 940
```

## Android editor

Android development requires JDK 21 and Android SDK API 36.

```sh
export JAVA_HOME=/path/to/jdk-21
pnpm android:test
pnpm android:lint
pnpm android:build
```

Install without clearing the current application data:

```sh
adb install -r apps/android/app/build/outputs/apk/debug/app-debug.apk
```

### Protect real tablet data

Do not run `connectedDebugAndroidTest` on a DC-1 or another device that contains the only copy of a Reed project. Android's connected-test lifecycle can replace the debug package and clear its local application data. Reed blocks connected tests unless the command explicitly includes `-PallowDeviceDataReset=true`; use that flag only on a disposable device/profile or after verifying a backup.

Test tablet UI changes in portrait, landscape, split screen, and a compact window. Check touch, keyboard, mouse, trackpad, pen hover, the Wacom side button, reduced motion, and grayscale contrast where relevant.

## Change rules

- Route all reads and writes through the platform ReedCore implementation.
- Do not write raw SQL or canonical JSON from a client.
- Add a migration for persisted model changes and preserve older projects.
- Never recycle Line IDs or Pixel Crushers numeric mappings.
- Preserve optimistic concurrency and mutation history.
- Keep Final content under human control; agents cannot promote text beyond `Polished`.
- Changing recorded-or-later dialogue must return its voice status to `Rework`.
- Give destructive actions a confirmation step or a reversible undo path.
- Do not add a background fetch, telemetry call, updater, remote asset, hosted configuration, Reed account, or embedded LLM.
- Never persist GitHub credentials in a project, database, preferences, logs, or Git configuration.
- Keep Git/GitHub optional, per-project, and user-triggered.
- Keep Remote Agent Access off by default, expiring, foreground-visible, and limited to guarded Reed tools.
- Add or update an automated offline test for every runtime entrypoint.
- Pair color with text, shape, icon, border, or pattern.
- Verify English, Greek, Griko, Italian, and German strings remain intact.

## Tests by change type

| Change | Minimum validation |
|---|---|
| Shared schema/core | `pnpm typecheck`, targeted tests, full serial Vitest suite, offline smoke |
| Electron UI/main process | Typecheck, targeted regression test, full serial Vitest suite |
| Export | Core tests, deterministic byte comparison, Unicode case, offline smoke |
| Git/GitHub | Local Git fixture tests; no live user repository in automated tests |
| MCP/CLI | Tool/command tests plus offline smoke |
| Relay | Relay integration tests with ephemeral localhost sockets and no persisted bodies |
| Android | `testDebugUnitTest`, `lintDebug`, `assembleDebug`; device check when interaction changes |
| Network boundary | Offline smoke plus a test proving idle/open behavior starts no network process |

## Pull requests

1. Create a focused branch from `main`.
2. Keep unrelated changes out of the commit.
3. Explain the user-visible problem and the chosen boundary.
4. Add a regression test for a bug or contract test for new behavior.
5. Include real screenshots for visual changes, using only demo data.
6. Report exact validation commands and any checks you could not run.
7. Call out migrations, compatibility changes, new permissions, and any network effect.

Commit messages should be short and descriptive, for example:

```text
fix(android): preserve pinch focal point
feat(core): export per-actor recording packets
docs: explain remote agent security boundary
```

By participating, you agree to follow the [Code of Conduct](CODE_OF_CONDUCT.md). Report vulnerabilities privately as described in [SECURITY.md](SECURITY.md).
