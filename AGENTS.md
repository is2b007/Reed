# Reed implementation rules

These rules apply to every change in this repository.

## Offline-first product

- Reed must be fully useful without a network connection. Git and GitHub are optional per project and disabled by default.
- The only permitted product networking is (1) an explicit, user-triggered Git or GitHub action after that project enables collaboration, or (2) an explicit, time-limited Android **Remote Agent Access** session. Desktop uses bundled/system `git` and `gh`; Android uses the embedded JGit transport because Android has no supported child-process Git runtime. Outside these isolated boundaries, do not add a general HTTP client or poll, fetch, push, authenticate, or refresh remote status in the background.
- Reed must not store GitHub credentials in a project, database, preferences, logs, or Git config. Desktop lets `gh` use the operating system credential store. Android may encrypt an optional repository token with Android Keystore and pass it to JGit only for the requested operation. Local work must remain available when credentials expire or the remote is unreachable.
- Do not add Reed accounts, login, telemetry, update checks, cloud sync, hosted storage, remote configuration, or hosted feature flags. The optional GitHub connection is repository tooling, not a Reed account.
- Do not load fonts, icons, scripts, styles, images, schemas, or other assets from URLs. Ship all required assets with the app.
- Do not embed an LLM client or generation UI. External agents may reach their own LLM endpoint and interact with Reed locally.
- Prefer local stdio or direct process IPC for MCP and CLI integration. Do not require a listening network service.
- Remote Agent Access is the narrow mobile exception: it must be off by default, started while Reed is visible, scoped to one project, limited to 24 hours or less, run as an Android foreground service with a persistent Disconnect notification, and stop on user request or expiry. It may expose only Reed MCP tools backed by Android `ReedCore`; it must never expose Git, SQL, arbitrary files, shell execution, or an LLM client. Its relay keeps request bodies only in memory and must not persist or log project content or connector secrets.
- Development-time package installation is allowed; installed dependencies must be vendored into distributable builds so the released product functions offline.
- Add an automated offline test before shipping any runtime entrypoint. It must cover GitHub-disabled and Remote-Agent-disabled operation and prove that merely opening either workspace starts no network process.

## Architecture

- All reads and writes go through the platform implementation of `@reed/core`. Clients must not write raw SQL or canonical JSON. Android's `com.reed.core.ReedCore` must preserve the shared snapshot and mutation contracts and is tested for parity.
- SQLite is canonical and uses WAL mode. Plain-text project JSON is a deterministic export, not a second source of truth.
- Every mutation increments a version, records history, and supports optimistic concurrency through `expectedVersion` where applicable.
- Line IDs and Pixel Crushers numeric mappings are permanent once issued.
- Agents cannot set text status above `Polished`. Final content is human-controlled.
- Any edit to text with recorded-or-later voice status sets voice status to `Rework`.
- Destructive actions require confirmation or a reversible undo path.

## UI

- Read `DESIGN.md` before making visual decisions.
- Optimize the primary desktop workspace for keyboard use and dense production work.
- Never encode node type, validation state, status, or speaker using color alone.
- Greek, Griko, Italian, German, and English must render correctly throughout the interface and exports.
