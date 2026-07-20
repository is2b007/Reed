package com.reed.core

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper

internal class ReedDatabase(context: Context, name: String = "reed.sqlite") :
    SQLiteOpenHelper(context, name, null, DATABASE_VERSION) {

    init {
        setWriteAheadLoggingEnabled(true)
    }

    override fun onConfigure(db: SQLiteDatabase) {
        super.onConfigure(db)
        db.setForeignKeyConstraintsEnabled(true)
    }

    override fun onCreate(db: SQLiteDatabase) {
        db.execSQL(
            """CREATE TABLE projects (
                id TEXT PRIMARY KEY,
                name TEXT NOT NULL,
                slug TEXT NOT NULL UNIQUE,
                schema_version INTEGER NOT NULL,
                languages_json TEXT NOT NULL,
                default_language TEXT NOT NULL,
                pr_provider TEXT NOT NULL,
                pr_base_branch TEXT NOT NULL,
                version INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE levels (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE partitions (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                name TEXT NOT NULL,
                scope_type TEXT NOT NULL,
                scope_id TEXT,
                base_id INTEGER NOT NULL,
                range_size INTEGER NOT NULL,
                export_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE scenes (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                level_id TEXT REFERENCES levels(id) ON DELETE SET NULL,
                partition_id TEXT NOT NULL REFERENCES partitions(id),
                name TEXT NOT NULL,
                slug TEXT NOT NULL,
                line_id_prefix TEXT NOT NULL,
                beat_ref TEXT NOT NULL,
                sort_order INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, slug)
            )"""
        )
        db.execSQL(
            """CREATE TABLE conversations (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                scene_id TEXT NOT NULL REFERENCES scenes(id) ON DELETE CASCADE,
                partition_id TEXT NOT NULL REFERENCES partitions(id),
                title TEXT NOT NULL,
                description TEXT NOT NULL,
                numeric_id INTEGER NOT NULL,
                version INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, numeric_id)
            )"""
        )
        db.execSQL(
            """CREATE TABLE characters (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                numeric_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                display_names_json TEXT NOT NULL,
                is_player INTEGER NOT NULL,
                portrait_path TEXT,
                description TEXT NOT NULL,
                actor_notes TEXT NOT NULL,
                voice_notes TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, numeric_id)
            )"""
        )
        db.execSQL(
            """CREATE TABLE variables (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                numeric_id INTEGER NOT NULL,
                name TEXT NOT NULL,
                type TEXT NOT NULL,
                initial_value_json TEXT NOT NULL,
                description TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, numeric_id),
                UNIQUE(project_id, name)
            )"""
        )
        db.execSQL(
            """CREATE TABLE nodes (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                line_id TEXT NOT NULL,
                entry_numeric_id INTEGER NOT NULL,
                kind TEXT NOT NULL,
                speaker_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
                listener_character_id TEXT REFERENCES characters(id) ON DELETE SET NULL,
                spoken_language TEXT NOT NULL,
                sequence_text TEXT NOT NULL,
                conditions TEXT NOT NULL,
                user_script TEXT NOT NULL,
                subtitle_override TEXT NOT NULL,
                context_comment TEXT NOT NULL,
                voice_comment TEXT NOT NULL,
                pronunciation TEXT NOT NULL,
                context_path_json TEXT NOT NULL,
                line_status TEXT NOT NULL,
                voice_status TEXT NOT NULL,
                tags_json TEXT NOT NULL,
                is_terminal INTEGER NOT NULL,
                x REAL NOT NULL,
                y REAL NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                UNIQUE(project_id, line_id),
                UNIQUE(conversation_id, entry_numeric_id)
            )"""
        )
        db.execSQL(
            """CREATE TABLE node_texts (
                node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                language TEXT NOT NULL,
                text_value TEXT NOT NULL,
                menu_text TEXT,
                verification_status TEXT NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL,
                PRIMARY KEY(node_id, language)
            )"""
        )
        db.execSQL(
            """CREATE TABLE links (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                origin_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                origin_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                destination_conversation_id TEXT NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
                destination_node_id TEXT NOT NULL REFERENCES nodes(id) ON DELETE CASCADE,
                priority INTEGER NOT NULL,
                created_at TEXT NOT NULL,
                updated_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE review_snapshots (
                id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
                backup_id TEXT NOT NULL,
                label TEXT NOT NULL,
                mutation_sequence INTEGER NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE mutations (
                sequence INTEGER PRIMARY KEY AUTOINCREMENT,
                project_id TEXT NOT NULL,
                project_version INTEGER NOT NULL,
                operation TEXT NOT NULL,
                entity_type TEXT NOT NULL,
                entity_id TEXT NOT NULL,
                before_json TEXT,
                after_json TEXT,
                source TEXT NOT NULL,
                created_at TEXT NOT NULL
            )"""
        )
        db.execSQL(
            """CREATE TABLE id_allocations (
                project_id TEXT NOT NULL,
                scope TEXT NOT NULL,
                next_value INTEGER NOT NULL,
                PRIMARY KEY(project_id, scope)
            )"""
        )
        db.execSQL("CREATE INDEX idx_conversations_scene ON conversations(scene_id)")
        db.execSQL("CREATE INDEX idx_nodes_conversation ON nodes(conversation_id)")
        db.execSQL("CREATE INDEX idx_nodes_line ON nodes(project_id, line_id)")
        db.execSQL("CREATE INDEX idx_mutations_project ON mutations(project_id, sequence)")
    }

    override fun onUpgrade(db: SQLiteDatabase, oldVersion: Int, newVersion: Int) {
        error("No Android schema migration from $oldVersion to $newVersion is registered")
    }

    companion object {
        const val DATABASE_VERSION = 1
    }
}
