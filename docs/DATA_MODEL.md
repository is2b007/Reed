# Reed data model

## Ownership

`Project → Level? → Scene → Conversation → DialogueNode`

- A project owns an ordered set of IETF BCP 47 language tags, a default writing language, cast, declared variables, database partitions, review baselines, and global version history. Reed ships an offline game-language catalog but permits custom and private-use tags.
- A level is an optional organizational container.
- A scene freezes its slug-derived Line-ID prefix and stores an external `beatRef`.
- A conversation maps one-to-one to a Pixel Crushers conversation and is an optimistic-concurrency aggregate.
- A node is `start`, `line`, `choice`, or `group`. Text is stored separately per language so graph structure and content can change independently.
- Links can target another conversation and store an explicit priority.

## Permanent identifiers

- Every non-START line receives an immutable `{scene-prefix}-{10 hex characters}` Line ID.
- Every character and declared variable receives a permanent numeric ID.
- Every conversation receives a permanent numeric ID inside its persisted database partition.
- Every entry receives a permanent numeric ID inside its conversation; START is always entry `0`.
- Export never recomputes these mappings. This protects localization, audio filenames, cross-links, and Unity saved-game references.

## Production states

Text: `placeholder → draft → polished → edited → final`, plus `rework`.

Voice: `none → placeholder → recorded → processed → final`, plus `rework`.

Agents may author only through Polished. Edited and Final are human states. Final text and links require explicit force to reopen. Editing text at Recorded or later sets voice to Rework; changing Final dialogue sets line status to Rework.

## Concurrency and history

SQLite uses WAL, foreign keys, full synchronization, short immediate transactions, and a busy timeout. Every mutation increments its project or conversation version and appends the before/after change to `mutation_log`. Passing `expectedVersion` makes a stale write fail with the mutations since that version instead of overwriting newer work.

The editor polls the change sequence and reloads external MCP/CLI changes. Review approval creates a named SQLite snapshot and records the mutation sequence as the next review baseline.

## Project JSON

`exports/reed-project.json` is a stable, sorted representation for Git review and interchange. It is not a parallel writable store. SQLite remains canonical.
