# Languages and game localization exports

Reed stores language identity as IETF BCP 47 tags and keeps every export local. A project can enable any structurally valid BCP 47 tag, not only the built-in catalog. Project settings provide 47 ready-to-use language presets, a game-market preset based on Steam's supported language set, a default writing language, search, and custom-tag entry.

The catalog includes Arabic, Bulgarian, Catalan, Simplified and Traditional Chinese, Croatian, Czech, Danish, Dutch, English and its AU/GB/US variants, Filipino, Finnish, French and French Canadian, German, Greek, Hebrew, Hindi, Hungarian, Indonesian, Italian, Japanese, Korean, Malay, Norwegian, Persian, Polish, European and Brazilian Portuguese, Romanian, Russian, Serbian in both scripts, Slovak, Slovenian, European and Latin American Spanish, Swedish, Thai, Turkish, Ukrainian, Vietnamese, Griko, and the private-use `x-griko` tag.

## Language identity

- Reed follows [IETF BCP 47 / RFC 5646](https://www.rfc-editor.org/info/rfc5646/) and canonicalizes case, so `pt-br` becomes `pt-BR` and `zh-hans` becomes `zh-Hans`.
- The game-market preset follows the languages exposed by [Steamworks](https://partner.steamgames.com/doc/store/localization/languages?language=english), while the larger Reed catalog adds common regional and localization-team requests.
- The existing `griko` project code remains supported so old Reed projects never lose identity. New projects that need a strictly private BCP 47 tag may use `x-griko`.
- Export adapters map identity only where an engine requires it: for example, `pt-BR` becomes `pt_BR` in a Godot CSV header and `zh-Hans` maps to Godot's `zh_CN`. Reed's stored project code does not change.
- Arabic, Hebrew, and Persian are marked right-to-left in the catalog. Direction is shown structurally in the selector and is available to future UI/export adapters; color is not used to encode it.

## Export formats

All outputs use permanent Reed Line IDs as keys. If a choice has separate menu text, the menu string is emitted as `<LineID>.menu`. This keeps spoken dialogue and player-facing choice text independently localizable.

| Reed export | Output | Intended use |
|---|---|---|
| Pixel Crushers | Dialogue Database JSON plus manifest | Full branching dialogue, conditions, scripts, actors, variables, and localization for Unity Dialogue System projects. |
| Unity Localization | One String Table Collection-style CSV | `Key`, stable numeric `Id`, shared comments, and one column per locale. Unity documents the same CSV row model in its [Localization package](https://docs.unity3d.com/Packages/com.unity.localization@1.4/manual/CSV.html). |
| Godot | One UTF-8 localization CSV | `keys` plus locale columns. Context columns start with `_`, so Godot ignores them while humans retain speaker and Line ID context. This follows [Godot's spreadsheet localization format](https://docs.godotengine.org/en/stable/tutorials/i18n/localization_using_spreadsheets.html). |
| Unreal String Table | One CSV per culture | `Key` and `SourceString`, with context as additional metadata columns. Unreal documents those two mandatory columns in [String Tables](https://dev.epicgames.com/documentation/en-us/unreal-engine/using-string-tables-for-text-in-unreal-engine). |
| Yarn Spinner | One `.yarn` script per scene plus one strings CSV per language | `language,id,text,file,node,lineNumber,lock,comment`, following [Yarn Spinner's built-in localization layout](https://docs.yarnspinner.dev/yarn-spinner-for-unity/assets-and-localization/inbuilt-localisation). |
| gettext | One `.po` catalog per language | Version-control-friendly handoff for gettext tooling and engines such as Godot, which [supports PO files](https://docs.godotengine.org/en/latest/tutorials/i18n/localization_using_gettext.html). |
| XLIFF 2.0 | One bilingual `.xliff` per target | CAT-tool and localization-vendor interchange with source, target, context, and Reed Line ID notes, using the [OASIS XLIFF 2.0 vocabulary](https://www.oasis-open.org/standard/xliffv2-0/). |
| Plain JSON | One deterministic localization dictionary | Custom engines, scripts, build pipelines, and inspection. Includes speaker, listener, scene, conversation, context, tags, text, and menu text. |
| Plain CSV | One long-form UTF-8 table | Spreadsheets, databases, and custom pipelines. One row per Line ID and language. |

Except for Pixel Crushers, these are localization/string interchange exports, not conversions of Reed's branching runtime logic into another engine's scripting language. Reed's deterministic project JSON remains the complete portable graph snapshot.

## Desktop workflow

1. Open the project name in the navigator or choose **File → Project Settings**.
2. Search the catalog, apply the game-market preset, or add a custom BCP 47 tag.
3. Choose the default writing language and save. The project change is versioned like every other mutation.
4. Open **Export**. Engine and tool adapters are grouped under **Game engines & localization tools**; plain formats are under **Portable files**.
5. Reed writes under `exports/integrations/<format>/`. Nothing is uploaded.

## CLI and MCP

```sh
reed export-game-data --project /path/to/project --format godot
reed export-game-data --project /path/to/project --format xliff-2.0 --languages el,it,pt-BR
reed export-game-data --project /path/to/project --format unreal-string-table --output /path/to/game/Content/Localization/Reed
```

Allowed formats are `json`, `csv`, `unity-localization`, `godot`, `unreal-string-table`, `yarn-spinner`, `gettext`, and `xliff-2.0`.

Local agents can call `export_game_data` with `format`, optional `languages`, and an optional local `outputDirectory`. `get_schema` returns the catalog and states the BCP 47 language contract. The tool is local stdio on desktop and never makes a network request.

## Integration checks before shipping

- Import the generated table into the exact engine/plugin version used by the game.
- Confirm locale identifiers match the project's engine configuration and fallback rules.
- Confirm `.menu` keys are bound where choices use separate menu text.
- Treat the generated files as outputs; make narrative changes in Reed and re-export.
- Keep a fixture from the real game in its integration test suite. A successful CSV or XML parse is not a claim of engine-version certification.
