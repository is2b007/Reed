# Local history and optional GitHub collaboration

Reed autosaves every completed edit to the canonical SQLite database. Autosave, recovery backups, and Git checkpoints solve different problems:

| Layer | Purpose | Location |
|---|---|---|
| Autosave | Keep the live project current after each edit. | `.reed/reed.sqlite` |
| Recovery backup | Restore the complete database after an accident. | `.reed/backups/` |
| Git checkpoint | Review and retain named versions of the story and project-owned files. | `.git/` plus `exports/reed-project.json` |

## Use the editor

Open **More → History** or **Project → Local History**. Choose **Initialize local history** once, then enter a meaningful checkpoint name whenever you reach a reviewable milestone. Reed exports the latest deterministic project JSON immediately before each commit.

The command bar’s **Saved** control is the Git and GitHub control center. It keeps database save state and Git state distinct: **Saved** means SQLite is current, while the branch name, **History off**, or **not checkpointed** label describes the latest reviewable Git snapshot. Open it to initialize local history, create a checkpoint, enable GitHub, check or reconnect the system account, connect an existing repository, choose **Check for updates**, or **Push to GitHub** without leaving the current workspace. Connection state is shared with the full History workspace, so completing sign-in in either place updates both. Choose **Full GitHub & PR workspace** for repository creation, branches, pull-request creation, reviews, and merges.

The checkpoint includes project-owned notes and assets. Reed’s generated `.gitignore` excludes the live `.reed/` database, macOS metadata, and generated handoff files; `exports/reed-project.json` is deliberately included as the reviewable story snapshot.

## Optional GitHub workspace

GitHub is off for every project until you enable it. Open **Project → Project Settings…**, set **GitHub collaboration** to **On — network when requested**, and choose the base branch contributors should target (normally `main`). This setting is versioned with the project; it does not create a Reed account or contact GitHub.

The fastest path is **Saved → Set up GitHub sync → Check connection**. You can also enable it in **Project → Project Settings…** and use **More → History**. Checking the connection is the first point at which Reed may start the bundled GitHub helper. If the computer is signed out or its credential has expired, choose **Reconnect GitHub**; Reed opens GitHub's browser-based sign-in and lets the helper store its credential in the macOS credential store. Reed never reads or saves the token itself, and no Terminal setup is required.

Once connected, the History workspace can:

- create a private, public, or internal GitHub repository and connect it as `origin`;
- connect an existing `owner/repository`, GitHub HTTPS URL, or GitHub SSH URL;
- fetch remote references without changing the open story database;
- push a clean checkpointed branch;
- create a pull request from the current branch;
- list open pull requests and show their merge/check state;
- approve, request changes, or leave a review comment;
- merge with merge-commit, squash, or rebase after a confirmation.

Every remote operation has its own visible button. Reed performs no background status refresh, authentication, fetch, push, polling, or synchronization. Turning GitHub off returns the project to completely local behavior without deleting its local repository or checkpoints.

## Team pull-request workflow

The typical in-app sequence is:

1. Create a checkpoint so the current branch is clean.
2. Start a new local branch such as `story/harbour-arrival`.
3. Edit in Reed and create one or more checkpoints.
4. Enable GitHub collaboration, connect the account, and create or connect the repository if needed.
5. Choose **Push to GitHub**. Reed refuses to push a dirty branch or one that is behind its upstream.
6. Enter a title and review notes, then choose **Create pull request**.
7. Collaborators use the pull-request cards in History to review and merge.

Reed validates the local base branch, current branch, clean checkpoint, GitHub origin, ahead/behind counts, and changed files before it publishes. GitHub can still reject an operation for permissions, branch protection, failed checks, conflicts, or loss of connection; Reed reports that result without affecting local saves.

### Canonical-data boundary for teams

The live `.reed/reed.sqlite` database is intentionally excluded from Git because SQLite is canonical and binary database merging would be unsafe. Pull requests review deterministic `exports/reed-project.json` snapshots and project-owned notes/assets. Fetch and merge update Git references or the GitHub pull request; they never silently import a remote snapshot into the open database.

For concurrent teams, keep one designated integration owner for the canonical project. Contributors propose reviewable snapshots from their own project copies; after review, the integration owner applies accepted story edits through Reed UI, CLI, or MCP, validates them, and creates the merge checkpoint. This keeps permanent IDs, mutation history, voice rework rules, and optimistic concurrency intact instead of bypassing `@reed/core`.

## CLI and agent boundary

The editor provides the complete human GitHub workflow. The CLI remains local/offline and retains its inert `git-pr-handoff` output for external automation that wants to inspect suggested commands. The MCP server has no networked GitHub tools, so an agent cannot publish or merge behind the user's back.

```sh
reed --project /path/to/story git-status
reed --project /path/to/story git-init
reed --project /path/to/story git-checkpoint "Lock chapter one dialogue"
reed --project /path/to/story update-project --pull-requests github --pr-base main
reed --project /path/to/story git-set-remote git@github.com:team/story.git
reed --project /path/to/story git-branch story/chapter-one
reed --project /path/to/story git-pr-handoff --title "Review chapter one" --body "Ready for story review" --number 123
reed --project /path/to/story git-set-remote --remove
```

Local commits use `Reed Local History <history@reed.local>` and disable repository hooks for the commit operation. Permanent Reed IDs and the SQLite source of truth are unaffected by Git.
