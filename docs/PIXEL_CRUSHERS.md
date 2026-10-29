# Pixel Crushers export and Unity import

## Export

Run `export-pixelcrushers` from the CLI/MCP or choose **Single dialogue database** in the Export workspace. By default Reed writes a single database to `exports/pixel-crushers`. Partitioned mode emits one database per configured partition/scene scope.

Each export contains actors, declared variables, conversations, entries, START entry `0`, conditions, scripts, sequences, canvas positions, groups, prioritized local/cross-conversation links, localized fields, and a custom `Line ID` field. The companion manifest maps `{LineID}.wav` to the Pixel Crushers entry tag. Descriptions are stamped `GENERATED — DO NOT HAND-EDIT`.

Partition Base ID ranges are persisted. Validation blocks overlapping ranges before output, so multiple databases can be loaded or merged without regenerating IDs.

## Import into Unity

1. Keep the Reed project/database as source of truth and commit the deterministic Reed JSON if desired.
2. Export Pixel Crushers JSON locally.
3. In the Unity project, open the Pixel Crushers Dialogue System JSON import window for a Dialogue Database.
4. Select the generated local JSON and import it into a generated Dialogue Database asset.
5. Do not edit generated dialogue in Unity. Re-export from Reed and replace/reimport the generated asset.
6. For modular runtime loading, attach Extra Databases or call `DialogueManager.AddDatabase(db)` using the project's normal local Unity workflow. Reed requires no server.
7. Name audio files exactly `{LineID}.wav`. Every line and choice carries a `VoiceOverFile` field equal to its Line ID, so set the Dialogue Manager's **Entrytag Format** to **VoiceOverFile** and `AudioWait(entrytag)` resolves the files directly. The manifest lists each Line ID with its entry tag and numeric conversation/entry IDs.

## Localized field names

The default mapping is `Dialogue Text` / `Menu Text` for the default language, the bare language code for localized dialogue (for example `de`), and `Menu Text de` for localized menu text. Localized fields use the Dialogue System's Localization field type.

Variables carry a typed `Initial Value` field (Boolean, Number, or Text), which the Dialogue System uses as the variable's runtime type, so Lua conditions such as `Variable["Gold"] > 3` compare numbers. The exporter accepts a field-name mapping override because Pixel Crushers conventions can vary by version/project.

## Required certification fixture

Before shipping into a specific Unity game, export one representative Dialogue Database from that exact installed Pixel Crushers version and add it under `fixtures/pixel-crushers/`. Verify:

1. actor, variable, conversation, entry, field, and link shapes;
2. default and localized Dialogue/Menu Text names;
3. import into Unity and export back without semantic changes;
4. stable numeric IDs after a second Reed export;
5. two partitioned databases loaded/merged together without collisions;
6. a cross-database link resolves at runtime;
7. the audio entry tag matches the generated manifest.

The repository does not include a licensed Unity/Pixel Crushers fixture, so this version-specific certification remains an external acceptance step. Reed deliberately does not implement Unity-to-Reed synchronization.
