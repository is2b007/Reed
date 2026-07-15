import type Database from "better-sqlite3";

interface Migration {
  version: number;
  name: string;
  sql: string;
}

const migrations: Migration[] = [
  {
    version: 1,
    name: "initial_schema",
    sql: `
      CREATE TABLE schema_migrations (
        version INTEGER PRIMARY KEY,
        name TEXT NOT NULL,
        applied_at TEXT NOT NULL
      );

      CREATE TABLE projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        schema_version INTEGER NOT NULL,
        languages_json TEXT NOT NULL,
        default_language TEXT NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE levels (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE TABLE database_partitions (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        scope_type TEXT NOT NULL CHECK(scope_type IN ('project', 'level', 'scene')),
        scope_id TEXT,
        base_id INTEGER NOT NULL,
        range_size INTEGER NOT NULL CHECK(range_size > 0),
        export_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, name),
        UNIQUE(project_id, base_id)
      );

      CREATE TABLE scenes (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        level_id TEXT REFERENCES levels(id) ON DELETE SET NULL,
        partition_id TEXT NOT NULL REFERENCES database_partitions(id),
        name TEXT NOT NULL,
        slug TEXT NOT NULL,
        line_id_prefix TEXT NOT NULL,
        beat_ref TEXT NOT NULL DEFAULT '',
        sort_order INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, slug),
        UNIQUE(project_id, line_id_prefix)
      );

      CREATE TABLE conversations (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
        partition_id TEXT NOT NULL REFERENCES database_partitions(id),
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        numeric_id INTEGER NOT NULL,
        version INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(partition_id, numeric_id)
      );

      CREATE TABLE characters (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        display_names_json TEXT NOT NULL DEFAULT '{}',
        is_player INTEGER NOT NULL DEFAULT 0 CHECK(is_player IN (0, 1)),
        portrait_path TEXT,
        description TEXT NOT NULL DEFAULT '',
        actor_notes TEXT NOT NULL DEFAULT '',
        voice_notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, name)
      );

      CREATE TABLE variables (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        type TEXT NOT NULL CHECK(type IN ('boolean', 'number', 'text')),
        initial_value_json TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(project_id, name)
      );

      CREATE TABLE dialogue_nodes (
        id TEXT PRIMARY KEY,
        conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        line_id TEXT NOT NULL UNIQUE,
        entry_numeric_id INTEGER NOT NULL,
        kind TEXT NOT NULL CHECK(kind IN ('start', 'line', 'choice', 'group')),
        speaker_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        listener_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
        spoken_language TEXT NOT NULL,
        sequence TEXT NOT NULL DEFAULT '',
        conditions TEXT NOT NULL DEFAULT '',
        user_script TEXT NOT NULL DEFAULT '',
        subtitle_override TEXT NOT NULL DEFAULT 'none' CHECK(subtitle_override IN ('none', 'forced')),
        context_comment TEXT NOT NULL DEFAULT '',
        voice_comment TEXT NOT NULL DEFAULT '',
        context_path_json TEXT NOT NULL DEFAULT '[]',
        line_status TEXT NOT NULL DEFAULT 'draft' CHECK(line_status IN ('placeholder', 'draft', 'polished', 'edited', 'final', 'rework')),
        voice_status TEXT NOT NULL DEFAULT 'none' CHECK(voice_status IN ('none', 'placeholder', 'recorded', 'processed', 'final', 'rework')),
        tags_json TEXT NOT NULL DEFAULT '[]',
        is_terminal INTEGER NOT NULL DEFAULT 0 CHECK(is_terminal IN (0, 1)),
        x REAL NOT NULL DEFAULT 0,
        y REAL NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(conversation_id, entry_numeric_id)
      );

      CREATE TABLE node_texts (
        node_id TEXT NOT NULL REFERENCES dialogue_nodes(id) ON DELETE CASCADE,
        language_code TEXT NOT NULL,
        dialogue_text TEXT NOT NULL DEFAULT '',
        menu_text TEXT,
        verification_status TEXT NOT NULL DEFAULT 'unverified' CHECK(verification_status IN ('unverified', 'native-verified')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(node_id, language_code)
      );

      CREATE TABLE dialogue_links (
        id TEXT PRIMARY KEY,
        origin_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        origin_node_id TEXT NOT NULL REFERENCES dialogue_nodes(id) ON DELETE CASCADE,
        destination_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        destination_node_id TEXT NOT NULL REFERENCES dialogue_nodes(id) ON DELETE CASCADE,
        priority INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(origin_node_id, destination_node_id)
      );

      CREATE TABLE mutation_log (
        sequence INTEGER PRIMARY KEY AUTOINCREMENT,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        aggregate_type TEXT NOT NULL CHECK(aggregate_type IN ('project', 'conversation')),
        aggregate_id TEXT NOT NULL,
        conversation_id TEXT,
        base_version INTEGER NOT NULL,
        new_version INTEGER NOT NULL,
        operation TEXT NOT NULL,
        source TEXT NOT NULL CHECK(source IN ('human', 'agent', 'system')),
        changes_json TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE backup_records (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        kind TEXT NOT NULL CHECK(kind IN ('rolling', 'named')),
        label TEXT,
        file_path TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL
      );

      CREATE VIRTUAL TABLE line_search USING fts5(
        line_id UNINDEXED,
        language_code UNINDEXED,
        dialogue_text,
        menu_text,
        tokenize = 'unicode61 remove_diacritics 0'
      );

      CREATE INDEX idx_levels_project ON levels(project_id, sort_order, id);
      CREATE INDEX idx_scenes_project ON scenes(project_id, sort_order, id);
      CREATE INDEX idx_scenes_level ON scenes(level_id, sort_order, id);
      CREATE INDEX idx_conversations_scene ON conversations(scene_id, id);
      CREATE INDEX idx_nodes_conversation ON dialogue_nodes(conversation_id, entry_numeric_id);
      CREATE INDEX idx_nodes_speaker ON dialogue_nodes(speaker_character_id);
      CREATE INDEX idx_links_origin_conversation ON dialogue_links(origin_conversation_id, priority, id);
      CREATE INDEX idx_links_destination_conversation ON dialogue_links(destination_conversation_id, id);
      CREATE INDEX idx_mutation_aggregate ON mutation_log(aggregate_id, new_version, sequence);
      CREATE INDEX idx_mutation_project ON mutation_log(project_id, sequence);
      CREATE INDEX idx_backups_project ON backup_records(project_id, created_at);
    `,
  },
  {
    version: 2,
    name: "production_ids_and_reviews",
    sql: `
      ALTER TABLE characters ADD COLUMN numeric_id INTEGER;
      ALTER TABLE variables ADD COLUMN numeric_id INTEGER;

      UPDATE characters SET numeric_id = (
        SELECT COUNT(*) FROM characters earlier
        WHERE earlier.project_id = characters.project_id
          AND (earlier.created_at < characters.created_at OR (earlier.created_at = characters.created_at AND earlier.id <= characters.id))
      );
      UPDATE variables SET numeric_id = (
        SELECT COUNT(*) FROM variables earlier
        WHERE earlier.project_id = variables.project_id
          AND (earlier.created_at < variables.created_at OR (earlier.created_at = variables.created_at AND earlier.id <= variables.id))
      );

      CREATE UNIQUE INDEX idx_characters_numeric ON characters(project_id, numeric_id);
      CREATE UNIQUE INDEX idx_variables_numeric ON variables(project_id, numeric_id);

      CREATE TABLE review_snapshots (
        id TEXT PRIMARY KEY,
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        backup_id TEXT NOT NULL REFERENCES backup_records(id) ON DELETE RESTRICT,
        label TEXT NOT NULL,
        mutation_sequence INTEGER NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE TABLE project_settings (
        project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        value_json TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        PRIMARY KEY(project_id, key)
      );

      CREATE INDEX idx_reviews_project ON review_snapshots(project_id, mutation_sequence, created_at);
    `,
  },
];

export function runMigrations(db: Database.Database): void {
  const hasMigrationTable = db
    .prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'schema_migrations'")
    .get();

  const applied = hasMigrationTable
    ? new Set(
        (db.prepare("SELECT version FROM schema_migrations ORDER BY version").all() as Array<{ version: number }>).map(
          (row) => row.version,
        ),
      )
    : new Set<number>();

  for (const migration of migrations) {
    if (applied.has(migration.version)) continue;
    const apply = db.transaction(() => {
      db.exec(migration.sql);
      db.prepare("INSERT INTO schema_migrations(version, name, applied_at) VALUES (?, ?, ?)").run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      );
      db.pragma(`user_version = ${migration.version}`);
    });
    apply.immediate();
  }
}
