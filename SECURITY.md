# Security policy

Reed protects locally authored story data. Security reports involving project confidentiality, credential handling, offline guarantees, destructive mutations, or Remote Agent Access are treated as product-security issues.

## Supported versions

Reed is pre-1.0. Security fixes are made on `main` and included in the next tagged release. Older preview builds may not receive separate patches.

| Version | Supported |
|---|---|
| `main` / latest source | Yes |
| Latest tagged preview | Best effort |
| Older preview releases | No |

## Report a vulnerability privately

Use [GitHub private vulnerability reporting](https://github.com/is2b007/Reed/security/advisories/new). Do not open a public issue for a suspected vulnerability and do not include a real project, GitHub token, connector capability URL, database, or private story content in a report.

Include, when possible:

- the affected commit or release;
- macOS/Android version and device architecture;
- whether GitHub collaboration or Remote Agent Access was enabled;
- steps using a disposable project;
- expected and observed behavior;
- security impact; and
- a minimal proof of concept with secrets removed.

The maintainer will acknowledge reports and coordinate disclosure on a best-effort basis. Please allow time for a fix and release before publishing details.

## High-priority boundaries

Please report:

- network traffic started by opening Reed or an idle workspace;
- story data, SQL, arbitrary files, shell access, Git, or credentials exposed through Android Remote Agent Access;
- connector capabilities, GitHub tokens, request bodies, or story text persisted in relay logs/storage;
- GitHub credentials written to a project, SQLite, preferences, logs, or Git configuration;
- bypasses for Final-content protection, version conflicts, exact destructive confirmation, or voice `Rework` rules;
- path traversal outside an open project;
- unsafe import/export behavior that overwrites unrelated files;
- a relay authorization, request-mixing, replay, or cross-channel isolation failure; or
- a dependency vulnerability that is reachable through Reed's runtime behavior.

## Designed security boundaries

- Normal authoring, storage, backup, validation, playtest, and export are local.
- Git/GitHub is optional per project and runs only after a labelled user action.
- Desktop authentication belongs to GitHub CLI and the operating-system credential store.
- Android can encrypt an optional repository token with Android Keystore and supplies it only to JGit for the requested operation.
- Remote Agent Access is off by default, scoped to one project, limited to 24 hours or less, and visible through a foreground notification with Disconnect.
- The relay keeps active channel state in memory only and must redact query strings and authorization headers from infrastructure logs.
- Remote tools cannot invoke Git, SQL, arbitrary files, shell execution, or an LLM.

The complete acceptance contract is in [docs/OFFLINE_CONTRACT.md](docs/OFFLINE_CONTRACT.md), and the Android relay threat model is in [docs/REMOTE_MCP_ANDROID.md](docs/REMOTE_MCP_ANDROID.md).

## Public repository protections

Use GitHub's private vulnerability-reporting link above for sensitive findings. Release automation fails closed when platform-signing credentials are missing, and CI verifies the offline contract before changes are merged.
