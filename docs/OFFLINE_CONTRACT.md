# Reed offline contract

This is a product requirement, not a graceful-degradation mode. A released Reed build must be fully useful on a computer with no network connection.

## Process boundary

```text
optional network                    offline Reed boundary

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
```

The external agent owns its credentials and LLM connection. No credential, LLM SDK, endpoint, or generation interface belongs in Reed.

## Allowed runtime I/O

- local files and directories;
- SQLite database, WAL, and lock files;
- local process stdio and direct IPC;
- user-selected Unity project directories;
- printers and local PDF generation;
- operating-system clipboard, file picker, and notifications.

## Forbidden runtime I/O

- HTTP, HTTPS, WebSocket, WebRTC, DNS, or other outbound network calls;
- analytics, crash upload, telemetry, update checks, license checks, and remote feature flags;
- cloud sync, remote backups, remote databases, or hosted authentication;
- CDN fonts, icon sets, scripts, styles, images, schemas, or help content;
- mandatory localhost web services when stdio or direct IPC can serve the same purpose;
- embedded browsers pointed at online help or third-party pages.

## Distribution requirements

- Bundle fonts, icons, schemas, migrations, help, and export templates.
- Keep user data outside application bundles in a user-selected or documented local directory.
- Backups and named versions are ordinary local files that can be copied without Reed.
- Export ordering is deterministic so Git works without a Reed account or server.
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
9. Inspect process traffic and fail the test if Reed attempts any network connection.
10. Verify there are no remote asset URLs in built HTML, CSS, JavaScript, or packaged configuration.

An automated integration test should deny network APIs at the process level and exercise the same vertical slice. Static checks are useful but cannot replace the process-level test.
