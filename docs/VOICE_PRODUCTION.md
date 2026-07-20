# Voice production handoff

Reed’s voice export is designed as a recording-room package, not a database dump. Open **More → Export → Voice production**, then choose:

- **Recording language** — the exact dialogue the actor should speak.
- **Actor packet** — the whole cast or one character.
- **Lines** — polished-or-later lines ready for recording, voice rework pickups, or every authored line.

The preflight shows line, word, and estimated read-time totals. If any selected line lacks dialogue in the requested language, export stops instead of substituting a reference language.

## Package contents

The default `exports/voice/` folder contains:

| File | Recipient and purpose |
|---|---|
| `voice-actor-handoff.pdf` | Studio/director master with package summary, cast totals, character briefs, context, direction, dialogue, permanent Line IDs, and exact WAV names. |
| `actors/NNN-character-lines.pdf` | Focused actor packet with only that character’s material and writable take/pickup notes. |
| `voice-lines.xlsx` | Session summary plus an editable recording tracker with frozen identity columns, filters, take/pickup choices, and studio notes. Its print area keeps the essential recording columns on one landscape page width. |
| `voice-lines.csv` | UTF-8 interchange data for a DAW, file-renaming tool, or another local pipeline. |

Every delivered recording should use the listed permanent `<Line ID>.wav` filename. Line IDs are never recycled, so recorded audio remains traceable across later story revisions.

## What to author before export

In the line inspector, open **Voice context** and keep these fields distinct:

- **Story context** explains what has just happened and who is present.
- **Pronunciation guide** records phonetic spelling, stress, or a language note.
- **Performance direction** describes intention, pace, emotion, or delivery.
- **Authored context path** selects the preceding path when a branch needs more specific context than the automatic shortest route.

Character records contribute the description, actor notes, voice/accent notes, and localized display name. The actor PDF also shows the closest preceding and following speaker lines so performers can understand the exchange without reading the entire branching graph.

## CLI and MCP

CLI example:

```sh
reed --project /absolute/path/to/story export-voice \
  --language el \
  --line-status polished,edited,final \
  --status none,placeholder,rework
```

`--character` accepts comma-separated character UUIDs. MCP’s `export_voice` exposes equivalent `language`, `characterIds`, `lineStatuses`, and `voiceStatuses` values. Both write files locally and use the same `@reed/core` export path as the editor.

Voice export never makes a network call. Sending the resulting files to a studio remains an explicit action outside Reed.
