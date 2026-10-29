# Reed offline-first contract

This is a product requirement, not a graceful-degradation mode. A released Reed build must be fully useful on a computer with no network connection. Optional GitHub collaboration and time-limited Android Remote Agent Access are user-controlled exceptions; both are disabled by default and never required for authoring, validation, backup, local MCP, CLI, playtest, or export.

## Process boundary

```text
optional network                    local Reed boundary

External agent/CLI ── LLM endpoint
       │
       └── local stdio / process invocation ── Reed MCP or Reed CLI
                                                │
                                                ▼
Editor ─────────────────────────────────── @reed/core
                                                │
                                                ▼
                               SQLite + local files + backups
                                                │
                                                ▼
                              Unity JSON / CSV / PDF / XLSX exports

User action ── platform Git adapter ── Git remote
              (desktop: bundled git/gh; Android: embedded JGit)
              (only when the project has enabled collaboration)

Claude cloud ── public Reed relay ── outbound Android foreground service
                (memory only)        (only during a visible, expiring session)
                                             │
                                             ▼
                                      Android ReedCore
```

The external agent owns its credentials and LLM connection. No credential, LLM SDK, endpoint, or generation interface belongs in Reed.

The optional Git adapter owns the Git transport. Desktop credentials stay in the operating-system credential store through `gh`. Android has no supported child-process Git runtime, so its JGit adapter may pass an optional HTTPS token decrypted from Android Keystore for the duration of the selected action. Reed never writes credentials into a project, database, Git configuration, export, or log. It does not contain a general-purpose HTTP client, poll a remote, or connect merely because the History workspace is open. Every remote action starts from a visible user control.

Remote Agent Access is isolated to Android's `remote` transport module and a foreground service. It starts only after confirmation in a visible activity, is scoped to one project for at most 24 hours, has a persistent Disconnect notification, and exposes guarded MCP tools backed by Android ReedCore. Its public relay stores nothing on disk and must not log MCP bodies or capability URLs. Git, raw SQL, arbitrary files, shell execution, and model credentials are outside this boundary.

## Allowed runtime I/O

- local files and directories;
- SQLite database, WAL, and lock files;
- local process stdio and direct IPC;
- user-selected Unity project directories;
- printers and local PDF generation;
- operating-system clipboard, file picker, and notifications.
- user-triggered Git transport for a project whose collaboration setting is enabled: `git`/`gh` child processes on desktop or the isolated JGit module on Android.
- user-triggered, time-limited HTTPS traffic from the isolated Android Remote Agent foreground service to its configured Reed relay.
- the desktop updater's HTTPS requests to GitHub (`api.github.com` and GitHub release downloads only), made from a dedicated in-memory Electron session when the user presses **Check for Updates** or **Install and restart**, or on the launch/12-hour schedule only after the user turns on **Check automatically**. Automatic checks are off by default, downloads are verified against the release `SHA256SUMS.txt`, and nothing installs without a click.

## Forbidden runtime I/O

- direct HTTP, HTTPS, WebSocket, WebRTC, DNS, or other outbound network clients in Reed runtime code outside the explicit platform Git and Android Remote Agent transport boundaries;
- analytics, crash upload, telemetry, update checks the user has not requested or enabled, license checks, and remote feature flags;
- cloud sync, remote backups, remote databases, or hosted authentication;
- CDN fonts, icon sets, scripts, styles, images, schemas, or help content;
- mandatory localhost web services when stdio or direct IPC can serve the same purpose;
- embedded browsers pointed at online help or third-party pages. GitHub authentication may open the user's external browser after an explicit **Connect GitHub** action.

## Distribution requirements

- Bundle fonts, icons, schemas, migrations, help, and export templates.
- Keep user data outside application bundles in a user-selected or documented local directory.
- Backups and named versions are ordinary local files that can be copied without Reed.
- Export ordering is deterministic so Git works without a Reed account or server.
- Local Git support may initialize repositories, inspect status/history, create commits and branches, compare a branch with its local base, and edit the local `origin` configuration with no network.
- The packaged Mac app should bundle a compatible `gh` executable. Reed may execute `git` or `gh` only after GitHub collaboration is enabled for the project and the user requests connection, repository creation/connection, fetch, push, pull-request creation, review, or merge.
- GitHub status is checked only when the user asks. Do not add token persistence on desktop or a remote requirement for local save/history.
- Git autosave (Reed settings on desktop, the Git workspace on Android; on by default, every 5 minutes) is the one scheduled network action. It commits the open story only in projects that already have local history, and pushes only when the project has a remote (desktop: with GitHub collaboration on; Android: with a saved token). It fetches to compare, never pulls or merges into the open story, and never force-pushes: when the remote is ahead it keeps committing locally and tells the writer. Closing a project or quitting commits locally without touching the network. Turning it off restores fully manual behavior.
- Android remote credentials, when a private HTTPS repository requires them, are encrypted with Android Keystore. Only the JGit boundary may decrypt them, while handling a pressed Clone, Fetch, Pull, Push, or Sync action or a Git autosave push.
- Release notes and documentation must be available locally.

## Verification gates

Before a release:

1. Build the distributable while online, then disconnect the machine or block all egress.
2. Launch Reed with an empty user-data directory.
3. Create a project, characters, variables, a branching conversation, and translations.
4. Close and reopen the app; confirm all data persists.
5. Run the Reed CLI and local MCP server through stdio while the editor is open.
6. Confirm external mutations hot-reload and stale `expectedVersion` writes fail safely.
7. Create an automatic backup, a named version, and restore both.
8. Export project JSON, Pixel Crushers JSON, screenplay PDF/Markdown, and voice CSV/XLSX.
9. Leave GitHub collaboration disabled; inspect process traffic and fail the test if Reed attempts any network connection.
10. Verify there are no remote asset URLs in built HTML, CSS, JavaScript, or packaged configuration.
11. Enable GitHub collaboration, open History, and verify no `git`/`gh` network process starts before an explicit action.
12. Exercise GitHub operations with a fake `gh` executable and verify connection, repository, push, pull-request, review, and merge arguments without contacting a real remote.
13. Build the Android APK, run its offline-boundary test, and exercise create/open/edit/restart with networking denied.
14. Run Android Git integration against a local bare repository, then separately verify Clone, Fetch, fast-forward Pull, Checkpoint, and Push against a test remote only after pressing each action.
15. Open the Android Agent workspace without enabling it and verify there is no network traffic or foreground service.
16. Exercise the relay and Android MCP dispatcher with fixture credentials; verify invalid capabilities, disconnect, expiry, stale writes, Final guardrails, and the absence of Git tools.

An automated integration test should deny network APIs at the process level and exercise the same vertical slice. Static checks are useful but cannot replace the process-level test. Separate integration coverage should substitute a fake GitHub CLI so the opt-in process boundary can be tested deterministically and without credentials.

Run Reed's automated acceptance with:

```sh
CI=true pnpm test:offline
```

The test injects a process-level guard that throws on HTTP, HTTPS, sockets, TLS, DNS, datagrams, fetch, and WebSocket; then creates a Unicode branching project, runs the built CLI and stdio MCP server, creates a backup, and produces project, Pixel Crushers, screenplay, PDF, CSV, and XLSX outputs. It also scans Reed-owned runtime source for direct network clients, telemetry/updaters, and remote asset references, and verifies the Electron request boundary covers HTTP(S) and WebSocket traffic. The packaged app separately cancels those protocols in Electron and ships its assets locally. GitHub integration tests replace `gh` with a local fixture and assert that disabled or merely opened GitHub UI does not execute it.
