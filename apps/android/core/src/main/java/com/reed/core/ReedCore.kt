package com.reed.core

import android.content.ContentValues
import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import kotlinx.serialization.decodeFromString
import kotlinx.serialization.encodeToString
import kotlinx.serialization.ExperimentalSerializationApi
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.io.FileOutputStream
import java.time.Instant
import java.util.UUID

/**
 * Android platform implementation of the @reed/core boundary.
 *
 * UI and Git clients call this class; neither may access SQLite or canonical JSON directly.
 */
class ReedCore(
    context: Context,
    databaseName: String = "reed.sqlite",
) : AutoCloseable {
    private val helper = ReedDatabase(context.applicationContext, databaseName)
    @OptIn(ExperimentalSerializationApi::class)
    private val json = Json {
        prettyPrint = true
        prettyPrintIndent = "  "
        encodeDefaults = true
        explicitNulls = true
        ignoreUnknownKeys = false
    }

    init {
        helper.writableDatabase
    }

    fun listProjects(): List<ProjectSummary> = helper.readableDatabase.query(
        "projects",
        arrayOf("id", "name", "slug", "languages_json", "default_language", "version", "updated_at"),
        null, null, null, null, "updated_at DESC"
    ).use { cursor ->
        buildList {
            while (cursor.moveToNext()) {
                add(
                    ProjectSummary(
                        id = cursor.string("id"),
                        name = cursor.string("name"),
                        slug = cursor.string("slug"),
                        languages = json.decodeFromString(cursor.string("languages_json")),
                        defaultLanguage = cursor.string("default_language"),
                        version = cursor.long("version"),
                        updatedAt = cursor.string("updated_at"),
                    )
                )
            }
        }
    }

    fun createProject(
        name: String,
        slug: String,
        languages: List<String> = listOf("en", "el", "it", "de", "griko"),
        defaultLanguage: String = "en",
    ): ProjectSnapshot {
        require(name.isNotBlank()) { "Project name is required" }
        require(slug.matches(Regex("^[a-z0-9][a-z0-9-]{1,62}$"))) { "Invalid project slug" }
        require(languages.isNotEmpty() && languages.distinct().size == languages.size) { "Languages must be unique" }
        require(defaultLanguage in languages) { "Default language must be configured" }
        val now = Instant.now().toString()
        val projectId = uuid()
        val levelId = uuid()
        val partitionId = uuid()
        val sceneId = uuid()
        val conversationId = uuid()
        val startNodeId = uuid()
        val sceneSlug = "opening"
        val prefix = slug.replace("-", "_").take(24)
        val snapshot = ProjectSnapshot(
            project = ProjectRecord(
                id = projectId,
                name = name.trim(),
                slug = slug,
                languages = languages,
                defaultLanguage = defaultLanguage,
                version = 1,
                createdAt = now,
                updatedAt = now,
            ),
            levels = listOf(LevelRecord(levelId, projectId, "Main", 0, now, now)),
            partitions = listOf(
                DatabasePartitionRecord(partitionId, projectId, "Main", "project", null, 0, 100_000, 0, now, now)
            ),
            scenes = listOf(
                SceneRecord(sceneId, projectId, levelId, partitionId, "Opening", sceneSlug, prefix, "", 0, now, now)
            ),
            conversations = listOf(
                ConversationGraph(
                    id = conversationId,
                    projectId = projectId,
                    sceneId = sceneId,
                    partitionId = partitionId,
                    title = "Opening conversation",
                    numericId = 1,
                    version = 1,
                    createdAt = now,
                    updatedAt = now,
                    nodes = listOf(
                        DialogueNodeRecord(
                            id = startNodeId,
                            conversationId = conversationId,
                            lineId = "${prefix}_start",
                            entryNumericId = 0,
                            kind = NodeKind.START,
                            spokenLanguage = defaultLanguage,
                            lineStatus = TextStatus.PLACEHOLDER,
                            voiceStatus = VoiceStatus.NONE,
                            x = 48.0,
                            y = 96.0,
                            createdAt = now,
                            updatedAt = now,
                            texts = languages.map { NodeTextRecord(it, "", null, VerificationStatus.UNVERIFIED, now, now) },
                        )
                    )
                )
            ),
            allocations = ProjectAllocationLedger(mapOf(conversationId to 0)),
        )
        importSnapshot(snapshot, source = "human")
        return snapshot
    }

    fun importProjectFile(file: File, source: String = "system"): ProjectSnapshot {
        require(file.isFile) { "Project export not found: ${file.path}" }
        return importSnapshot(file.readText(Charsets.UTF_8), source)
    }

    fun importSnapshot(serialized: String, source: String = "system"): ProjectSnapshot {
        return importSnapshot(validateProjectJson(serialized), source)
    }

    fun validateProjectJson(serialized: String): ProjectSnapshot {
        val snapshot = try {
            json.decodeFromString<ProjectSnapshot>(serialized)
        } catch (error: Exception) {
            throw InvalidProjectException("Invalid Reed project JSON: ${error.message}")
        }
        validateSnapshot(snapshot)
        return snapshot
    }

    fun importSnapshot(snapshot: ProjectSnapshot, source: String = "system"): ProjectSnapshot {
        validateSnapshot(snapshot)
        transaction { db ->
            db.delete("projects", "id = ?", arrayOf(snapshot.project.id))
            insertProject(db, snapshot.project)
            snapshot.levels.sortedBy { it.sortOrder }.forEach { insertLevel(db, it) }
            snapshot.partitions.sortedBy { it.exportOrder }.forEach { insertPartition(db, it) }
            snapshot.scenes.sortedWith(compareBy(SceneRecord::sortOrder, SceneRecord::id)).forEach { insertScene(db, it) }
            snapshot.characters.sortedBy { it.numericId }.forEach { insertCharacter(db, it) }
            snapshot.variables.sortedBy { it.numericId }.forEach { insertVariable(db, it) }
            snapshot.conversations.sortedBy { it.numericId }.forEach { graph ->
                insertConversation(db, graph.asRecord())
                graph.nodes.sortedBy { it.entryNumericId }.forEach { node ->
                    insertNode(db, snapshot.project.id, node)
                    node.texts.sortedBy { it.language }.forEach { insertNodeText(db, node.id, it) }
                }
            }
            snapshot.conversations.flatMap { it.links }.sortedBy { it.id }.forEach {
                insertLink(db, snapshot.project.id, it)
            }
            snapshot.reviewSnapshots.sortedBy { it.createdAt }.forEach { insertReviewSnapshot(db, it) }
            seedAllocations(db, snapshot)
            recordMutation(
                db, snapshot.project.id, snapshot.project.version, "import", "project", snapshot.project.id,
                null, "{\"formatVersion\":${snapshot.formatVersion}}", source
            )
        }
        return exportSnapshot(snapshot.project.id)
    }

    fun exportProject(directory: File, projectId: String): File {
        val output = File(directory, "exports/reed-project.json")
        output.parentFile?.mkdirs()
        val temporary = File(output.parentFile, ".reed-project.json.tmp")
        val bytes = exportProjectJson(projectId).toByteArray(Charsets.UTF_8)
        FileOutputStream(temporary).use { stream ->
            stream.write(bytes)
            stream.fd.sync()
        }
        check(temporary.renameTo(output)) { "Unable to atomically write ${output.path}" }
        return output
    }

    fun exportProjectJson(projectId: String): String = json.encodeToString(exportSnapshot(projectId)) + "\n"

    fun projectOverview(projectId: String): ProjectOverview {
        val snapshot = exportSnapshot(projectId)
        return ProjectOverview(
            project = snapshot.project,
            scenes = snapshot.scenes,
            conversations = snapshot.conversations.map { it.asRecord() },
            characters = snapshot.characters,
            variables = snapshot.variables,
        )
    }

    fun conversationGraph(conversationId: String): ConversationGraph {
        val db = helper.readableDatabase
        val conversation = readConversations(db, "id = ?", arrayOf(conversationId)).singleOrNull()
            ?: throw NoSuchElementException("Conversation not found: $conversationId")
        return conversation.copy(
            nodes = readNodes(db, conversationId),
            links = readLinks(db, conversationId),
        )
    }

    fun nodeByLineId(projectId: String, lineId: String): DialogueNodeRecord =
        readNodeByLineId(helper.readableDatabase, projectId, lineId)

    fun createScene(
        projectId: String,
        name: String,
        slug: String,
        beatRef: String = "",
        sortOrder: Int = 0,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<SceneRecord> = transaction { db ->
        validateSource(source)
        require(name.isNotBlank() && name.length <= 120) { "Scene name is required and must be at most 120 characters" }
        require(slug.matches(Regex("^[a-z0-9][a-z0-9-]{1,62}$"))) { "Invalid scene slug" }
        require(beatRef.length <= 300) { "Beat reference is too long" }
        require(sortOrder >= 0) { "Scene order cannot be negative" }
        val project = readProject(db, projectId)
        checkVersion(project.version, expectedVersion)
        val scenes = readScenes(db, projectId)
        val prefix = slug.replace('-', '_').take(24)
        require(scenes.none { it.slug == slug || it.lineIdPrefix == prefix }) { "Scene slug or Line ID prefix already exists" }
        val partition = readPartitions(db, projectId).minByOrNull { it.exportOrder }
            ?: throw IllegalStateException("Project has no database partition")
        val levelId = readLevels(db, projectId).minByOrNull { it.sortOrder }?.id
        val now = Instant.now().toString()
        val scene = SceneRecord(
            id = uuid(), projectId = projectId, levelId = levelId, partitionId = partition.id,
            name = name.trim(), slug = slug, lineIdPrefix = prefix, beatRef = beatRef,
            sortOrder = sortOrder, createdAt = now, updatedAt = now,
        )
        insertScene(db, scene)
        val version = incrementVersion(db, projectId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "create_scene", "scene", scene.id, null,
            json.encodeToString(scene), source,
        )
        MutationResult(scene, version, sequence)
    }

    fun createConversation(
        projectId: String,
        sceneId: String,
        title: String,
        description: String = "",
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<ConversationGraph> = transaction { db ->
        validateSource(source)
        require(title.isNotBlank() && title.length <= 200) { "Conversation title is required and must be at most 200 characters" }
        require(description.length <= 4_000) { "Conversation description is too long" }
        val project = readProject(db, projectId)
        checkVersion(project.version, expectedVersion)
        val scene = readScenes(db, projectId).firstOrNull { it.id == sceneId }
            ?: throw NoSuchElementException("Scene not found: $sceneId")
        val numericId = allocate(db, projectId, "conversation")
        val lineNumber = allocate(db, projectId, "line:${scene.lineIdPrefix}")
        val now = Instant.now().toString()
        val conversationId = uuid()
        val conversation = ConversationGraph(
            id = conversationId, projectId = projectId, sceneId = scene.id, partitionId = scene.partitionId,
            title = title.trim(), description = description, numericId = numericId, version = 1,
            createdAt = now, updatedAt = now,
        )
        val start = DialogueNodeRecord(
            id = uuid(), conversationId = conversationId,
            lineId = "${scene.lineIdPrefix}_${lineNumber.toString().padStart(4, '0')}",
            entryNumericId = 0, kind = NodeKind.START, spokenLanguage = project.defaultLanguage,
            lineStatus = TextStatus.FINAL, voiceStatus = VoiceStatus.NONE,
            x = 48.0, y = 96.0, createdAt = now, updatedAt = now,
            texts = project.languages.map { NodeTextRecord(it, "", null, VerificationStatus.UNVERIFIED, now, now) },
        )
        insertConversation(db, conversation.asRecord())
        insertNode(db, projectId, start)
        start.texts.forEach { insertNodeText(db, start.id, it) }
        putAllocation(db, projectId, "node:$conversationId", 1)
        val version = incrementVersion(db, projectId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "create_conversation", "conversation", conversationId, null,
            "{\"title\":${json.encodeToString(conversation.title)},\"startLineId\":${json.encodeToString(start.lineId)}}", source,
        )
        MutationResult(conversation.copy(nodes = listOf(start)), version, sequence)
    }

    fun setNodeText(
        projectId: String,
        lineId: String,
        language: String,
        text: String,
        menuText: String?,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<NodeTextRecord> = transaction { db ->
        validateSource(source)
        require(text.length <= 20_000) { "Dialogue text is too long" }
        require(menuText == null || menuText.length <= 2_000) { "Menu text is too long" }
        val project = readProject(db, projectId)
        require(language in project.languages) { "Language is not configured: $language" }
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        require(source != "agent" || node.lineStatus != TextStatus.FINAL) { "Agents cannot edit Final line text" }
        val before = db.rawQuery(
            "SELECT text_value, menu_text, verification_status, created_at FROM node_texts WHERE node_id = ? AND language = ?",
            arrayOf(node.id, language)
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.string("text_value") else null
        }
        val now = Instant.now().toString()
        val createdAt = db.rawQuery(
            "SELECT created_at FROM node_texts WHERE node_id = ? AND language = ?",
            arrayOf(node.id, language)
        ).use { if (it.moveToFirst()) it.string("created_at") else now }
        val record = NodeTextRecord(language, text, menuText, VerificationStatus.UNVERIFIED, createdAt, now)
        insertNodeText(db, node.id, record, replace = true)
        if (node.voiceStatus in setOf(VoiceStatus.RECORDED, VoiceStatus.PROCESSED, VoiceStatus.FINAL)) {
        db.execSQL("UPDATE nodes SET voice_status = 'rework', updated_at = ? WHERE id = ?", arrayOf<Any?>(now, node.id))
        } else {
            db.execSQL("UPDATE nodes SET updated_at = ? WHERE id = ?", arrayOf<Any?>(now, node.id))
        }
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "set_node_text", "node_text", "$lineId:$language",
            before?.let { json.encodeToString(it) }, json.encodeToString(text), source
        )
        MutationResult(record, version, sequence)
    }

    fun updateNodePosition(
        projectId: String,
        lineId: String,
        x: Double,
        y: Double,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<Pair<Double, Double>> = transaction { db ->
        validateSource(source)
        require(x.isFinite() && y.isFinite()) { "Node position must be finite" }
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        val now = Instant.now().toString()
        db.execSQL("UPDATE nodes SET x = ?, y = ?, updated_at = ? WHERE id = ?", arrayOf<Any?>(x, y, now, node.id))
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "move_node", "node", lineId,
            "[${node.x},${node.y}]", "[$x,$y]", source
        )
        MutationResult(x to y, version, sequence)
    }

    fun updateNode(
        projectId: String,
        lineId: String,
        sequence: String? = null,
        conditions: String? = null,
        userScript: String? = null,
        contextComment: String? = null,
        voiceComment: String? = null,
        pronunciation: String? = null,
        tags: List<String>? = null,
        isTerminal: Boolean? = null,
        x: Double? = null,
        y: Double? = null,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<DialogueNodeRecord> = transaction { db ->
        validateSource(source)
        listOf(sequence, conditions, userScript).filterNotNull().forEach {
            require(it.length <= 20_000) { "Node script field is too long" }
        }
        listOf(contextComment, voiceComment, pronunciation).filterNotNull().forEach {
            require(it.length <= 8_000) { "Node note is too long" }
        }
        require(tags == null || tags.size <= 100 && tags.all { it.isNotBlank() && it.length <= 80 }) { "Invalid node tags" }
        require(x == null || x.isFinite()) { "Node x position must be finite" }
        require(y == null || y.isFinite()) { "Node y position must be finite" }
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        require(source != "agent" || node.lineStatus != TextStatus.FINAL) { "Agents cannot edit Final node metadata" }
        val now = Instant.now().toString()
        val updated = node.copy(
            sequence = sequence ?: node.sequence,
            conditions = conditions ?: node.conditions,
            userScript = userScript ?: node.userScript,
            contextComment = contextComment ?: node.contextComment,
            voiceComment = voiceComment ?: node.voiceComment,
            pronunciation = pronunciation ?: node.pronunciation,
            tags = tags?.distinct()?.sorted() ?: node.tags,
            isTerminal = isTerminal ?: node.isTerminal,
            x = x ?: node.x,
            y = y ?: node.y,
            updatedAt = now,
        )
        db.execSQL(
            """UPDATE nodes SET sequence = ?, conditions = ?, user_script = ?, context_comment = ?, voice_comment = ?,
                pronunciation = ?, tags_json = ?, is_terminal = ?, x = ?, y = ?, updated_at = ? WHERE id = ?""",
            arrayOf<Any?>(
                updated.sequence, updated.conditions, updated.userScript, updated.contextComment, updated.voiceComment,
                updated.pronunciation, json.encodeToString(updated.tags), if (updated.isTerminal) 1 else 0,
                updated.x, updated.y, now, updated.id,
            ),
        )
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val changeSequence = recordMutation(
            db, projectId, version, "update_node", "node", lineId,
            json.encodeToString(node), json.encodeToString(updated), source,
        )
        MutationResult(updated, version, changeSequence)
    }

    fun setLineStatus(
        projectId: String,
        lineId: String,
        status: TextStatus,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<TextStatus> = transaction { db ->
        validateSource(source)
        require(source != "agent" || status !in setOf(TextStatus.EDITED, TextStatus.FINAL)) {
            "Agents cannot set line status above Polished"
        }
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        val now = Instant.now().toString()
        db.execSQL("UPDATE nodes SET line_status = ?, updated_at = ? WHERE id = ?", arrayOf<Any?>(status.wire, now, node.id))
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "set_line_status", "node", lineId,
            json.encodeToString(node.lineStatus.wire), json.encodeToString(status.wire), source
        )
        MutationResult(status, version, sequence)
    }

    fun createNode(
        projectId: String,
        conversationId: String,
        kind: NodeKind,
        x: Double,
        y: Double,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<DialogueNodeRecord> = transaction { db ->
        validateSource(source)
        require(kind != NodeKind.START) { "A conversation can only have one start node" }
        val project = readProject(db, projectId)
        val conversation = readConversations(db, "id = ? AND project_id = ?", arrayOf(conversationId, projectId)).singleOrNull()
            ?: throw NoSuchElementException("Conversation not found: $conversationId")
        checkVersion(conversation.version, expectedVersion)
        val scene = readScenes(db, projectId).first { it.id == conversation.sceneId }
        val numericId = allocate(db, projectId, "node:$conversationId")
        val lineNumber = allocate(db, projectId, "line:${scene.lineIdPrefix}")
        val now = Instant.now().toString()
        val node = DialogueNodeRecord(
            id = uuid(),
            conversationId = conversationId,
            lineId = "${scene.lineIdPrefix}_${lineNumber.toString().padStart(4, '0')}",
            entryNumericId = numericId,
            kind = kind,
            spokenLanguage = project.defaultLanguage,
            lineStatus = TextStatus.PLACEHOLDER,
            voiceStatus = VoiceStatus.NONE,
            x = x,
            y = y,
            createdAt = now,
            updatedAt = now,
            texts = project.languages.map {
                NodeTextRecord(it, "", null, VerificationStatus.UNVERIFIED, now, now)
            }
        )
        insertNode(db, projectId, node)
        node.texts.forEach { insertNodeText(db, node.id, it) }
        val version = incrementConversationVersion(db, conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "create_node", "node", node.lineId, null,
            "{\"kind\":\"${kind.wire}\"}", source
        )
        MutationResult(node, version, sequence)
    }

    fun deleteNode(
        projectId: String,
        lineId: String,
        confirmation: String,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<String> = transaction { db ->
        validateSource(source)
        require(lineId == confirmation) { "Deletion confirmation did not match the line ID" }
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        require(node.kind != NodeKind.START) { "The start node cannot be deleted" }
        require(source != "agent" || node.lineStatus != TextStatus.FINAL) { "Agents cannot delete Final lines" }
        db.delete("nodes", "id = ?", arrayOf(node.id))
        val now = Instant.now().toString()
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "delete_node", "node", lineId,
            "{\"kind\":\"${node.kind.wire}\"}", null, source
        )
        MutationResult(lineId, version, sequence)
    }

    fun linkNodes(
        projectId: String,
        originLineId: String,
        destinationLineId: String,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<DialogueLinkRecord> = transaction { db ->
        validateSource(source)
        require(originLineId != destinationLineId) { "A node cannot link to itself" }
        val origin = readNodeByLineId(db, projectId, originLineId)
        val destination = readNodeByLineId(db, projectId, destinationLineId)
        val conversation = readConversations(db, "id = ?", arrayOf(origin.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        val touchesFinal = (origin.kind != NodeKind.START && origin.lineStatus == TextStatus.FINAL) ||
            (destination.kind != NodeKind.START && destination.lineStatus == TextStatus.FINAL)
        require(source != "agent" || !touchesFinal) { "Agents cannot reconnect Final content" }
        val duplicate = db.rawQuery(
            "SELECT 1 FROM links WHERE origin_node_id = ? AND destination_node_id = ?",
            arrayOf(origin.id, destination.id)
        ).use { it.moveToFirst() }
        require(!duplicate) { "These nodes are already linked" }
        val priority = db.rawQuery(
            "SELECT COALESCE(MAX(priority), -1) + 1 FROM links WHERE origin_node_id = ?", arrayOf(origin.id)
        ).use { it.moveToFirst(); it.getInt(0) }
        val now = Instant.now().toString()
        val link = DialogueLinkRecord(
            id = uuid(),
            originConversationId = origin.conversationId,
            originNodeId = origin.id,
            destinationConversationId = destination.conversationId,
            destinationNodeId = destination.id,
            priority = priority,
            createdAt = now,
            updatedAt = now,
        )
        insertLink(db, projectId, link)
        val version = incrementConversationVersion(db, origin.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "link_nodes", "link", link.id, null,
            "{\"origin\":\"$originLineId\",\"destination\":\"$destinationLineId\"}", source
        )
        MutationResult(link, version, sequence)
    }

    fun unlinkNodes(
        projectId: String,
        linkId: String,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<String> = transaction { db ->
        validateSource(source)
        val conversationId = db.rawQuery(
            "SELECT origin_conversation_id FROM links WHERE project_id = ? AND id = ?", arrayOf(projectId, linkId)
        ).use { cursor -> if (cursor.moveToFirst()) cursor.getString(0) else null }
            ?: throw IllegalArgumentException("Link not found: $linkId")
        val conversation = readConversations(db, "id = ?", arrayOf(conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        if (source == "agent") {
            val link = readLinks(db, conversationId).first { it.id == linkId }
            val finalCount = db.rawQuery(
                "SELECT COUNT(*) FROM nodes WHERE id IN (?, ?) AND kind != 'start' AND line_status = 'final'",
                arrayOf(link.originNodeId, link.destinationNodeId),
            ).use { it.moveToFirst(); it.getInt(0) }
            require(finalCount == 0) {
                "Agents cannot unlink Final content"
            }
        }
        db.delete("links", "project_id = ? AND id = ?", arrayOf(projectId, linkId))
        val now = Instant.now().toString()
        val version = incrementConversationVersion(db, conversationId, expectedVersion, now)
        val sequence = recordMutation(db, projectId, version, "unlink_nodes", "link", linkId, "{}", null, source)
        MutationResult(linkId, version, sequence)
    }

    fun setNodeSpeaker(
        projectId: String,
        lineId: String,
        speakerCharacterId: String?,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<String?> = transaction { db ->
        validateSource(source)
        val node = readNodeByLineId(db, projectId, lineId)
        val conversation = readConversations(db, "id = ?", arrayOf(node.conversationId)).single()
        checkVersion(conversation.version, expectedVersion)
        require(source != "agent" || node.lineStatus != TextStatus.FINAL) { "Agents cannot edit Final node metadata" }
        if (speakerCharacterId != null) {
            require(readCharacters(db, projectId).any { it.id == speakerCharacterId }) { "Character not found" }
        }
        val now = Instant.now().toString()
        db.execSQL("UPDATE nodes SET speaker_character_id = ?, updated_at = ? WHERE id = ?", arrayOf<Any?>(speakerCharacterId, now, node.id))
        val version = incrementConversationVersion(db, node.conversationId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, "set_node_speaker", "node", lineId,
            node.speakerCharacterId?.let { json.encodeToString(it) }, speakerCharacterId?.let { json.encodeToString(it) }, source
        )
        MutationResult(speakerCharacterId, version, sequence)
    }

    fun upsertCharacter(
        projectId: String,
        id: String?,
        name: String,
        displayNames: Map<String, String>,
        isPlayer: Boolean,
        description: String,
        actorNotes: String,
        voiceNotes: String,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<CharacterRecord> = transaction { db ->
        validateSource(source)
        require(name.isNotBlank()) { "Character name is required" }
        require(description.length <= 8_000 && actorNotes.length <= 8_000 && voiceNotes.length <= 8_000) { "Character notes are too long" }
        val project = readProject(db, projectId)
        checkVersion(project.version, expectedVersion)
        require(displayNames.keys.all { it in project.languages }) { "A display-name language is not configured" }
        val existing = id?.let { key -> readCharacters(db, projectId).firstOrNull { it.id == key } }
        if (id != null) require(existing != null) { "Character not found: $id" }
        val now = Instant.now().toString()
        val record = CharacterRecord(
            id = existing?.id ?: uuid(), projectId = projectId,
            numericId = existing?.numericId ?: allocate(db, projectId, "character"), name = name.trim(),
            displayNames = displayNames.toSortedMap(), isPlayer = isPlayer, portraitPath = existing?.portraitPath,
            description = description, actorNotes = actorNotes, voiceNotes = voiceNotes,
            createdAt = existing?.createdAt ?: now, updatedAt = now
        )
        if (existing == null) {
            insertCharacter(db, record)
        } else {
            db.execSQL(
                """UPDATE characters SET name = ?, display_names_json = ?, is_player = ?, description = ?,
                    actor_notes = ?, voice_notes = ?, updated_at = ? WHERE id = ?""",
                arrayOf<Any?>(
                    record.name, json.encodeToString<Map<String, String>>(record.displayNames.toSortedMap()),
                    if (record.isPlayer) 1 else 0,
                    record.description, record.actorNotes, record.voiceNotes, record.updatedAt, record.id
                )
            )
        }
        val version = incrementVersion(db, projectId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, if (existing == null) "create_character" else "update_character", "character", record.id,
            existing?.let { json.encodeToString(it) }, json.encodeToString(record), source
        )
        MutationResult(record, version, sequence)
    }

    fun upsertVariable(
        projectId: String,
        id: String?,
        name: String,
        type: String,
        initialValue: JsonElement,
        description: String,
        expectedVersion: Long,
        source: String = "human",
    ): MutationResult<VariableRecord> = transaction { db ->
        validateSource(source)
        require(name.matches(Regex("^[A-Za-z_][A-Za-z0-9_.-]{0,127}$"))) { "Invalid variable name" }
        require(type in setOf("boolean", "number", "text")) { "Invalid variable type" }
        require(description.length <= 2_000) { "Variable description is too long" }
        val project = readProject(db, projectId)
        checkVersion(project.version, expectedVersion)
        val existing = id?.let { key -> readVariables(db, projectId).firstOrNull { it.id == key } }
        if (id != null) require(existing != null) { "Variable not found: $id" }
        require(readVariables(db, projectId).none { it.name == name && it.id != id }) { "Variable name already exists" }
        val now = Instant.now().toString()
        val record = VariableRecord(
            id = existing?.id ?: uuid(), projectId = projectId,
            numericId = existing?.numericId ?: allocate(db, projectId, "variable"), name = name,
            type = type, initialValue = initialValue, description = description,
            createdAt = existing?.createdAt ?: now, updatedAt = now
        )
        if (existing == null) {
            insertVariable(db, record)
        } else {
            db.execSQL(
                "UPDATE variables SET name = ?, type = ?, initial_value_json = ?, description = ?, updated_at = ? WHERE id = ?",
                arrayOf<Any?>(record.name, record.type, record.initialValue.toString(), record.description, record.updatedAt, record.id)
            )
        }
        val version = incrementVersion(db, projectId, expectedVersion, now)
        val sequence = recordMutation(
            db, projectId, version, if (existing == null) "create_variable" else "update_variable", "variable", record.id,
            existing?.let { json.encodeToString(it) }, json.encodeToString(record), source
        )
        MutationResult(record, version, sequence)
    }

    fun exportSnapshot(projectId: String): ProjectSnapshot {
        val db = helper.readableDatabase
        val project = readProject(db, projectId)
        val conversations = readConversations(db, "project_id = ?", arrayOf(projectId)).map { conversation ->
            conversation.copy(
                nodes = readNodes(db, conversation.id),
                links = readLinks(db, conversation.id),
            )
        }
        return ProjectSnapshot(
            project = project.copy(languages = project.languages.distinct()),
            levels = readLevels(db, projectId).sortedWith(compareBy(LevelRecord::sortOrder, LevelRecord::id)),
            scenes = readScenes(db, projectId).sortedWith(compareBy(SceneRecord::sortOrder, SceneRecord::id)),
            conversations = conversations.sortedWith(compareBy(ConversationGraph::numericId, ConversationGraph::id)),
            characters = readCharacters(db, projectId).map { it.copy(displayNames = it.displayNames.toSortedMap()) }
                .sortedWith(compareBy(CharacterRecord::numericId, CharacterRecord::id)),
            variables = readVariables(db, projectId).sortedWith(compareBy(VariableRecord::numericId, VariableRecord::id)),
            partitions = readPartitions(db, projectId).sortedWith(compareBy(DatabasePartitionRecord::exportOrder, DatabasePartitionRecord::id)),
            reviewSnapshots = readReviewSnapshots(db, projectId).sortedWith(compareBy(ReviewSnapshotRecord::createdAt, ReviewSnapshotRecord::id)),
            allocations = ProjectAllocationLedger(readEntryAllocations(db, projectId)),
        )
    }

    override fun close() = helper.close()

    private fun validateSnapshot(snapshot: ProjectSnapshot) {
        if (snapshot.format != "reed-project" || snapshot.formatVersion != 1) {
            throw InvalidProjectException("Unsupported Reed project format")
        }
        val project = snapshot.project
        if (project.schemaVersion != 1) throw InvalidProjectException("Unsupported schema version ${project.schemaVersion}")
        if (project.id.isBlank() || project.name.isBlank()) throw InvalidProjectException("Project identity is missing")
        if (project.languages.isEmpty() || project.defaultLanguage !in project.languages) {
            throw InvalidProjectException("Default language must be included in project languages")
        }
        if (project.languages.distinct().size != project.languages.size) {
            throw InvalidProjectException("Project languages must be unique")
        }
        val partitionIds = snapshot.partitions.map { it.id }.toSet()
        val sceneIds = snapshot.scenes.map { it.id }.toSet()
        val conversationIds = snapshot.conversations.map { it.id }.toSet()
        val nodes = snapshot.conversations.flatMap { it.nodes }
        val nodeIds = nodes.map { it.id }.toSet()
        if (snapshot.levels.any { it.projectId != project.id } ||
            snapshot.partitions.any { it.projectId != project.id } ||
            snapshot.scenes.any { it.projectId != project.id } ||
            snapshot.conversations.any { it.projectId != project.id }
        ) throw InvalidProjectException("Project contains records owned by another project")
        if (snapshot.scenes.any { it.partitionId !in partitionIds }) throw InvalidProjectException("Scene references a missing partition")
        if (snapshot.conversations.any { it.sceneId !in sceneIds || it.partitionId !in partitionIds }) {
            throw InvalidProjectException("Conversation references a missing scene or partition")
        }
        if (nodes.any { it.conversationId !in conversationIds }) throw InvalidProjectException("Node references a missing conversation")
        if (nodes.map { it.lineId }.distinct().size != nodes.size || nodeIds.size != nodes.size) {
            throw InvalidProjectException("Node and line IDs must be unique and permanent")
        }
        val links = snapshot.conversations.flatMap { it.links }
        if (links.any { it.originNodeId !in nodeIds || it.destinationNodeId !in nodeIds }) {
            throw InvalidProjectException("Link references a missing node")
        }
        if (snapshot.conversations.any { graph -> graph.nodes.count { it.kind == NodeKind.START } != 1 }) {
            throw InvalidProjectException("Every conversation must contain exactly one start node")
        }
        if (nodes.any { node -> node.texts.map { it.language }.distinct().size != node.texts.size }) {
            throw InvalidProjectException("A node contains duplicate language text")
        }
    }

    private fun insertProject(db: SQLiteDatabase, value: ProjectRecord) = db.execSQL(
        """INSERT INTO projects
            (id,name,slug,schema_version,languages_json,default_language,pr_provider,pr_base_branch,version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.name, value.slug, value.schemaVersion, json.encodeToString(value.languages), value.defaultLanguage,
            value.pullRequestProvider, value.pullRequestBaseBranch, value.version, value.createdAt, value.updatedAt
        )
    )

    private fun insertLevel(db: SQLiteDatabase, value: LevelRecord) = db.execSQL(
        "INSERT INTO levels (id,project_id,name,sort_order,created_at,updated_at) VALUES (?,?,?,?,?,?)",
        arrayOf<Any?>(value.id, value.projectId, value.name, value.sortOrder, value.createdAt, value.updatedAt)
    )

    private fun insertPartition(db: SQLiteDatabase, value: DatabasePartitionRecord) = db.execSQL(
        """INSERT INTO partitions
            (id,project_id,name,scope_type,scope_id,base_id,range_size,export_order,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.projectId, value.name, value.scopeType, value.scopeId, value.baseId, value.rangeSize,
            value.exportOrder, value.createdAt, value.updatedAt
        )
    )

    private fun insertScene(db: SQLiteDatabase, value: SceneRecord) = db.execSQL(
        """INSERT INTO scenes
            (id,project_id,level_id,partition_id,name,slug,line_id_prefix,beat_ref,sort_order,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.projectId, value.levelId, value.partitionId, value.name, value.slug,
            value.lineIdPrefix, value.beatRef, value.sortOrder, value.createdAt, value.updatedAt
        )
    )

    private fun insertConversation(db: SQLiteDatabase, value: ConversationRecord) = db.execSQL(
        """INSERT INTO conversations
            (id,project_id,scene_id,partition_id,title,description,numeric_id,version,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.projectId, value.sceneId, value.partitionId, value.title, value.description,
            value.numericId, value.version, value.createdAt, value.updatedAt
        )
    )

    private fun insertCharacter(db: SQLiteDatabase, value: CharacterRecord) = db.execSQL(
        """INSERT INTO characters
            (id,project_id,numeric_id,name,display_names_json,is_player,portrait_path,description,actor_notes,voice_notes,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.projectId, value.numericId, value.name,
            json.encodeToString<Map<String, String>>(value.displayNames.toSortedMap()),
            if (value.isPlayer) 1 else 0, value.portraitPath, value.description, value.actorNotes, value.voiceNotes,
            value.createdAt, value.updatedAt
        )
    )

    private fun insertVariable(db: SQLiteDatabase, value: VariableRecord) = db.execSQL(
        """INSERT INTO variables
            (id,project_id,numeric_id,name,type,initial_value_json,description,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, value.projectId, value.numericId, value.name, value.type, value.initialValue.toString(),
            value.description, value.createdAt, value.updatedAt
        )
    )

    private fun insertNode(db: SQLiteDatabase, projectId: String, value: DialogueNodeRecord) = db.execSQL(
        """INSERT INTO nodes
            (id,project_id,conversation_id,line_id,entry_numeric_id,kind,speaker_character_id,listener_character_id,
             spoken_language,sequence_text,conditions,user_script,subtitle_override,context_comment,voice_comment,
             pronunciation,context_path_json,line_status,voice_status,tags_json,is_terminal,x,y,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, projectId, value.conversationId, value.lineId, value.entryNumericId, value.kind.wire,
            value.speakerCharacterId, value.listenerCharacterId, value.spokenLanguage, value.sequence, value.conditions,
            value.userScript, value.subtitleOverride, value.contextComment, value.voiceComment, value.pronunciation,
            json.encodeToString(value.contextPath), value.lineStatus.wire, value.voiceStatus.wire,
            json.encodeToString(value.tags), if (value.isTerminal) 1 else 0, value.x, value.y,
            value.createdAt, value.updatedAt
        )
    )

    private fun insertNodeText(db: SQLiteDatabase, nodeId: String, value: NodeTextRecord, replace: Boolean = false) {
        val verb = if (replace) "INSERT OR REPLACE" else "INSERT"
        db.execSQL(
            "$verb INTO node_texts (node_id,language,text_value,menu_text,verification_status,created_at,updated_at) VALUES (?,?,?,?,?,?,?)",
            arrayOf<Any?>(
                nodeId, value.language, value.text, value.menuText, value.verificationStatus.wire,
                value.createdAt, value.updatedAt
            )
        )
    }

    private fun insertLink(db: SQLiteDatabase, projectId: String, value: DialogueLinkRecord) = db.execSQL(
        """INSERT INTO links
            (id,project_id,origin_conversation_id,origin_node_id,destination_conversation_id,destination_node_id,priority,created_at,updated_at)
            VALUES (?,?,?,?,?,?,?,?,?)""",
        arrayOf<Any?>(
            value.id, projectId, value.originConversationId, value.originNodeId, value.destinationConversationId,
            value.destinationNodeId, value.priority, value.createdAt, value.updatedAt
        )
    )

    private fun insertReviewSnapshot(db: SQLiteDatabase, value: ReviewSnapshotRecord) = db.execSQL(
        "INSERT INTO review_snapshots (id,project_id,backup_id,label,mutation_sequence,created_at) VALUES (?,?,?,?,?,?)",
        arrayOf<Any?>(value.id, value.projectId, value.backupId, value.label, value.mutationSequence, value.createdAt)
    )

    private fun readProject(db: SQLiteDatabase, projectId: String): ProjectRecord = db.rawQuery(
        "SELECT * FROM projects WHERE id = ?", arrayOf(projectId)
    ).use { cursor ->
        if (!cursor.moveToFirst()) throw NoSuchElementException("Project not found: $projectId")
        cursor.project()
    }

    private fun readLevels(db: SQLiteDatabase, projectId: String): List<LevelRecord> = db.rawQuery(
        "SELECT * FROM levels WHERE project_id = ? ORDER BY sort_order,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.level() } }

    private fun readScenes(db: SQLiteDatabase, projectId: String): List<SceneRecord> = db.rawQuery(
        "SELECT * FROM scenes WHERE project_id = ? ORDER BY sort_order,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.scene() } }

    private fun readConversations(
        db: SQLiteDatabase,
        where: String,
        args: Array<String>,
    ): List<ConversationGraph> = db.rawQuery(
        "SELECT * FROM conversations WHERE $where ORDER BY numeric_id,id", args
    ).use { cursor -> cursor.mapRows { it.conversation() } }

    private fun readCharacters(db: SQLiteDatabase, projectId: String): List<CharacterRecord> = db.rawQuery(
        "SELECT * FROM characters WHERE project_id = ? ORDER BY numeric_id,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.character() } }

    private fun readVariables(db: SQLiteDatabase, projectId: String): List<VariableRecord> = db.rawQuery(
        "SELECT * FROM variables WHERE project_id = ? ORDER BY numeric_id,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.variableRecord() } }

    private fun readPartitions(db: SQLiteDatabase, projectId: String): List<DatabasePartitionRecord> = db.rawQuery(
        "SELECT * FROM partitions WHERE project_id = ? ORDER BY export_order,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.partition() } }

    private fun readReviewSnapshots(db: SQLiteDatabase, projectId: String): List<ReviewSnapshotRecord> = db.rawQuery(
        "SELECT * FROM review_snapshots WHERE project_id = ? ORDER BY created_at,id", arrayOf(projectId)
    ).use { cursor -> cursor.mapRows { it.reviewSnapshot() } }

    private fun readNodes(db: SQLiteDatabase, conversationId: String): List<DialogueNodeRecord> = db.rawQuery(
        "SELECT * FROM nodes WHERE conversation_id = ? ORDER BY entry_numeric_id,id", arrayOf(conversationId)
    ).use { cursor ->
        cursor.mapRows { row ->
            row.node().copy(texts = readNodeTexts(db, row.string("id")))
        }
    }

    private fun readNodeTexts(db: SQLiteDatabase, nodeId: String): List<NodeTextRecord> = db.rawQuery(
        "SELECT * FROM node_texts WHERE node_id = ? ORDER BY language", arrayOf(nodeId)
    ).use { cursor -> cursor.mapRows { it.nodeText() } }

    private fun readLinks(db: SQLiteDatabase, conversationId: String): List<DialogueLinkRecord> = db.rawQuery(
        "SELECT * FROM links WHERE origin_conversation_id = ? ORDER BY priority,id", arrayOf(conversationId)
    ).use { cursor -> cursor.mapRows { it.link() } }

    private fun readNodeByLineId(db: SQLiteDatabase, projectId: String, lineId: String): DialogueNodeRecord = db.rawQuery(
        "SELECT * FROM nodes WHERE project_id = ? AND line_id = ?", arrayOf(projectId, lineId)
    ).use { cursor ->
        if (!cursor.moveToFirst()) throw NoSuchElementException("Line not found: $lineId")
        cursor.node().copy(texts = readNodeTexts(db, cursor.string("id")))
    }

    private fun seedAllocations(db: SQLiteDatabase, snapshot: ProjectSnapshot) {
        val projectId = snapshot.project.id
        db.delete("id_allocations", "project_id = ?", arrayOf(projectId))
        putAllocation(db, projectId, "conversation", (snapshot.conversations.maxOfOrNull { it.numericId } ?: 0) + 1)
        putAllocation(db, projectId, "character", (snapshot.characters.maxOfOrNull { it.numericId } ?: 0) + 1)
        putAllocation(db, projectId, "variable", (snapshot.variables.maxOfOrNull { it.numericId } ?: 0) + 1)
        snapshot.conversations.forEach { graph ->
            val liveMaximum = graph.nodes.maxOfOrNull { it.entryNumericId } ?: 0
            val issuedMaximum = maxOf(liveMaximum, snapshot.allocations?.entryNumericIds?.get(graph.id) ?: 0)
            putAllocation(db, projectId, "node:${graph.id}", issuedMaximum + 1)
        }
        snapshot.scenes.forEach { scene ->
            val expression = Regex("^${Regex.escape(scene.lineIdPrefix)}_(\\d+)$")
            val issuedMaximum = snapshot.conversations.asSequence()
                .filter { it.sceneId == scene.id }
                .flatMap { it.nodes.asSequence() }
                .mapNotNull { expression.matchEntire(it.lineId)?.groupValues?.get(1)?.toIntOrNull() }
                .maxOrNull() ?: 0
            putAllocation(db, projectId, "line:${scene.lineIdPrefix}", issuedMaximum + 1)
        }
    }

    private fun readEntryAllocations(db: SQLiteDatabase, projectId: String): Map<String, Int> = db.rawQuery(
        "SELECT scope,next_value FROM id_allocations WHERE project_id = ? AND scope LIKE 'node:%' ORDER BY scope",
        arrayOf(projectId)
    ).use { cursor ->
        buildMap {
            while (cursor.moveToNext()) {
                put(cursor.getString(0).removePrefix("node:"), (cursor.getInt(1) - 1).coerceAtLeast(0))
            }
        }
    }

    private fun putAllocation(db: SQLiteDatabase, projectId: String, scope: String, next: Int) = db.execSQL(
        "INSERT OR REPLACE INTO id_allocations (project_id,scope,next_value) VALUES (?,?,?)",
        arrayOf<Any?>(projectId, scope, next)
    )

    private fun allocate(db: SQLiteDatabase, projectId: String, scope: String): Int {
        val value = db.rawQuery(
            "SELECT next_value FROM id_allocations WHERE project_id = ? AND scope = ?", arrayOf(projectId, scope)
        ).use { cursor -> if (cursor.moveToFirst()) cursor.getInt(0) else 1 }
        putAllocation(db, projectId, scope, value + 1)
        return value
    }

    private fun incrementVersion(db: SQLiteDatabase, projectId: String, expected: Long, now: String): Long {
        val current = db.rawQuery("SELECT version FROM projects WHERE id = ?", arrayOf(projectId)).use {
            if (!it.moveToFirst()) throw NoSuchElementException("Project not found: $projectId")
            it.getLong(0)
        }
        checkVersion(current, expected)
        val next = current + 1
        db.execSQL("UPDATE projects SET version = ?, updated_at = ? WHERE id = ?", arrayOf<Any?>(next, now, projectId))
        return next
    }

    private fun incrementConversationVersion(
        db: SQLiteDatabase,
        conversationId: String,
        expected: Long,
        now: String,
    ): Long {
        val current = db.rawQuery("SELECT version FROM conversations WHERE id = ?", arrayOf(conversationId)).use {
            if (!it.moveToFirst()) throw NoSuchElementException("Conversation not found: $conversationId")
            it.getLong(0)
        }
        checkVersion(current, expected)
        val next = current + 1
        db.execSQL("UPDATE conversations SET version = ?, updated_at = ? WHERE id = ?", arrayOf<Any?>(next, now, conversationId))
        return next
    }

    private fun checkVersion(actual: Long, expected: Long) {
        if (actual != expected) throw VersionConflictException(expected, actual)
    }

    private fun validateSource(source: String) {
        require(source in setOf("human", "agent", "system")) { "Invalid mutation source" }
    }

    private fun recordMutation(
        db: SQLiteDatabase,
        projectId: String,
        version: Long,
        operation: String,
        entityType: String,
        entityId: String,
        beforeJson: String?,
        afterJson: String?,
        source: String,
    ): Long {
        val values = ContentValues().apply {
            put("project_id", projectId)
            put("project_version", version)
            put("operation", operation)
            put("entity_type", entityType)
            put("entity_id", entityId)
            put("before_json", beforeJson)
            put("after_json", afterJson)
            put("source", source)
            put("created_at", Instant.now().toString())
        }
        return db.insertOrThrow("mutations", null, values)
    }

    private fun <T> transaction(block: (SQLiteDatabase) -> T): T {
        val db = helper.writableDatabase
        db.beginTransaction()
        return try {
            val result = block(db)
            db.setTransactionSuccessful()
            result
        } finally {
            db.endTransaction()
        }
    }

    private fun Cursor.project() = ProjectRecord(
        id = string("id"), name = string("name"), slug = string("slug"), schemaVersion = int("schema_version"),
        languages = json.decodeFromString(string("languages_json")), defaultLanguage = string("default_language"),
        pullRequestProvider = string("pr_provider"), pullRequestBaseBranch = string("pr_base_branch"),
        version = long("version"), createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.level() = LevelRecord(
        string("id"), string("project_id"), string("name"), int("sort_order"), string("created_at"), string("updated_at")
    )

    private fun Cursor.scene() = SceneRecord(
        id = string("id"), projectId = string("project_id"), levelId = nullableString("level_id"),
        partitionId = string("partition_id"), name = string("name"), slug = string("slug"),
        lineIdPrefix = string("line_id_prefix"), beatRef = string("beat_ref"), sortOrder = int("sort_order"),
        createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.conversation() = ConversationGraph(
        id = string("id"), projectId = string("project_id"), sceneId = string("scene_id"),
        partitionId = string("partition_id"), title = string("title"), description = string("description"),
        numericId = int("numeric_id"), version = long("version"), createdAt = string("created_at"),
        updatedAt = string("updated_at")
    )

    private fun Cursor.character() = CharacterRecord(
        id = string("id"), projectId = string("project_id"), numericId = int("numeric_id"), name = string("name"),
        displayNames = json.decodeFromString(string("display_names_json")), isPlayer = int("is_player") != 0,
        portraitPath = nullableString("portrait_path"), description = string("description"), actorNotes = string("actor_notes"),
        voiceNotes = string("voice_notes"), createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.variableRecord() = VariableRecord(
        id = string("id"), projectId = string("project_id"), numericId = int("numeric_id"), name = string("name"),
        type = string("type"), initialValue = json.parseToJsonElement(string("initial_value_json")),
        description = string("description"), createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.partition() = DatabasePartitionRecord(
        id = string("id"), projectId = string("project_id"), name = string("name"), scopeType = string("scope_type"),
        scopeId = nullableString("scope_id"), baseId = int("base_id"), rangeSize = int("range_size"),
        exportOrder = int("export_order"), createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.reviewSnapshot() = ReviewSnapshotRecord(
        id = string("id"), projectId = string("project_id"), backupId = string("backup_id"), label = string("label"),
        mutationSequence = long("mutation_sequence"), createdAt = string("created_at")
    )

    private fun Cursor.node() = DialogueNodeRecord(
        id = string("id"), conversationId = string("conversation_id"), lineId = string("line_id"),
        entryNumericId = int("entry_numeric_id"), kind = nodeKind(string("kind")),
        speakerCharacterId = nullableString("speaker_character_id"), listenerCharacterId = nullableString("listener_character_id"),
        spokenLanguage = string("spoken_language"), sequence = string("sequence_text"), conditions = string("conditions"),
        userScript = string("user_script"), subtitleOverride = string("subtitle_override"),
        contextComment = string("context_comment"), voiceComment = string("voice_comment"), pronunciation = string("pronunciation"),
        contextPath = json.decodeFromString(string("context_path_json")), lineStatus = textStatus(string("line_status")),
        voiceStatus = voiceStatus(string("voice_status")), tags = json.decodeFromString(string("tags_json")),
        isTerminal = int("is_terminal") != 0, x = double("x"), y = double("y"),
        createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.nodeText() = NodeTextRecord(
        language = string("language"), text = string("text_value"), menuText = nullableString("menu_text"),
        verificationStatus = verificationStatus(string("verification_status")), createdAt = string("created_at"),
        updatedAt = string("updated_at")
    )

    private fun Cursor.link() = DialogueLinkRecord(
        id = string("id"), originConversationId = string("origin_conversation_id"), originNodeId = string("origin_node_id"),
        destinationConversationId = string("destination_conversation_id"), destinationNodeId = string("destination_node_id"),
        priority = int("priority"), createdAt = string("created_at"), updatedAt = string("updated_at")
    )

    private fun Cursor.string(column: String) = getString(getColumnIndexOrThrow(column))
    private fun Cursor.nullableString(column: String): String? = getColumnIndexOrThrow(column).let { if (isNull(it)) null else getString(it) }
    private fun Cursor.int(column: String) = getInt(getColumnIndexOrThrow(column))
    private fun Cursor.long(column: String) = getLong(getColumnIndexOrThrow(column))
    private fun Cursor.double(column: String) = getDouble(getColumnIndexOrThrow(column))
    private fun <T> Cursor.mapRows(mapper: (Cursor) -> T): List<T> = buildList { while (moveToNext()) add(mapper(this@mapRows)) }

    private val NodeKind.wire get() = name.lowercase()
    private val TextStatus.wire get() = name.lowercase()
    private val VoiceStatus.wire get() = name.lowercase()
    private val VerificationStatus.wire get() = if (this == VerificationStatus.NATIVE_VERIFIED) "native-verified" else "unverified"
    private fun nodeKind(value: String) = NodeKind.valueOf(value.uppercase())
    private fun textStatus(value: String) = TextStatus.valueOf(value.uppercase())
    private fun voiceStatus(value: String) = VoiceStatus.valueOf(value.uppercase())
    private fun verificationStatus(value: String) = if (value == "native-verified") VerificationStatus.NATIVE_VERIFIED else VerificationStatus.UNVERIFIED
    private fun uuid() = UUID.randomUUID().toString()
}
