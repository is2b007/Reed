package com.reed.core

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

@Serializable
enum class NodeKind {
    @SerialName("start") START,
    @SerialName("line") LINE,
    @SerialName("choice") CHOICE,
    @SerialName("group") GROUP,
}

@Serializable
enum class TextStatus {
    @SerialName("placeholder") PLACEHOLDER,
    @SerialName("draft") DRAFT,
    @SerialName("polished") POLISHED,
    @SerialName("edited") EDITED,
    @SerialName("final") FINAL,
    @SerialName("rework") REWORK,
}

@Serializable
enum class VoiceStatus {
    @SerialName("none") NONE,
    @SerialName("placeholder") PLACEHOLDER,
    @SerialName("recorded") RECORDED,
    @SerialName("processed") PROCESSED,
    @SerialName("final") FINAL,
    @SerialName("rework") REWORK,
}

@Serializable
enum class VerificationStatus {
    @SerialName("unverified") UNVERIFIED,
    @SerialName("native-verified") NATIVE_VERIFIED,
}

@Serializable
data class ProjectRecord(
    val id: String,
    val name: String,
    val slug: String,
    val schemaVersion: Int = 1,
    val languages: List<String>,
    val defaultLanguage: String,
    val pullRequestProvider: String = "disabled",
    val pullRequestBaseBranch: String = "main",
    val version: Long,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class LevelRecord(
    val id: String,
    val projectId: String,
    val name: String,
    val sortOrder: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class SceneRecord(
    val id: String,
    val projectId: String,
    val levelId: String? = null,
    val partitionId: String,
    val name: String,
    val slug: String,
    val lineIdPrefix: String,
    val beatRef: String = "",
    val sortOrder: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class ConversationRecord(
    val id: String,
    val projectId: String,
    val sceneId: String,
    val partitionId: String,
    val title: String,
    val description: String = "",
    val numericId: Int,
    val version: Long,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class NodeTextRecord(
    val language: String,
    val text: String,
    val menuText: String? = null,
    val verificationStatus: VerificationStatus = VerificationStatus.UNVERIFIED,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class DialogueNodeRecord(
    val id: String,
    val conversationId: String,
    val lineId: String,
    val entryNumericId: Int,
    val kind: NodeKind,
    val speakerCharacterId: String? = null,
    val listenerCharacterId: String? = null,
    val spokenLanguage: String,
    val sequence: String = "",
    val conditions: String = "",
    val userScript: String = "",
    val subtitleOverride: String = "none",
    val contextComment: String = "",
    val voiceComment: String = "",
    val pronunciation: String = "",
    val contextPath: List<String> = emptyList(),
    val lineStatus: TextStatus,
    val voiceStatus: VoiceStatus,
    val tags: List<String> = emptyList(),
    val isTerminal: Boolean = false,
    val x: Double,
    val y: Double,
    val createdAt: String,
    val updatedAt: String,
    val texts: List<NodeTextRecord> = emptyList(),
)

@Serializable
data class DialogueLinkRecord(
    val id: String,
    val originConversationId: String,
    val originNodeId: String,
    val destinationConversationId: String,
    val destinationNodeId: String,
    val priority: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class ConversationGraph(
    val id: String,
    val projectId: String,
    val sceneId: String,
    val partitionId: String,
    val title: String,
    val description: String = "",
    val numericId: Int,
    val version: Long,
    val createdAt: String,
    val updatedAt: String,
    val nodes: List<DialogueNodeRecord> = emptyList(),
    val links: List<DialogueLinkRecord> = emptyList(),
) {
    fun asRecord() = ConversationRecord(
        id, projectId, sceneId, partitionId, title, description, numericId, version, createdAt, updatedAt
    )
}

@Serializable
data class CharacterRecord(
    val id: String,
    val projectId: String,
    val numericId: Int,
    val name: String,
    val displayNames: Map<String, String> = emptyMap(),
    val isPlayer: Boolean = false,
    val portraitPath: String? = null,
    val description: String = "",
    val actorNotes: String = "",
    val voiceNotes: String = "",
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class VariableRecord(
    val id: String,
    val projectId: String,
    val numericId: Int,
    val name: String,
    val type: String,
    val initialValue: JsonElement,
    val description: String = "",
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class DatabasePartitionRecord(
    val id: String,
    val projectId: String,
    val name: String,
    val scopeType: String,
    val scopeId: String? = null,
    val baseId: Int,
    val rangeSize: Int,
    val exportOrder: Int,
    val createdAt: String,
    val updatedAt: String,
)

@Serializable
data class ReviewSnapshotRecord(
    val id: String,
    val projectId: String,
    val backupId: String,
    val label: String,
    val mutationSequence: Long,
    val createdAt: String,
)

@Serializable
data class ProjectAllocationLedger(
    val entryNumericIds: Map<String, Int> = emptyMap(),
)

@Serializable
data class ProjectSnapshot(
    val format: String = "reed-project",
    val formatVersion: Int = 1,
    val exportedAt: String? = null,
    val project: ProjectRecord,
    val levels: List<LevelRecord> = emptyList(),
    val scenes: List<SceneRecord> = emptyList(),
    val conversations: List<ConversationGraph> = emptyList(),
    val characters: List<CharacterRecord> = emptyList(),
    val variables: List<VariableRecord> = emptyList(),
    val partitions: List<DatabasePartitionRecord> = emptyList(),
    val reviewSnapshots: List<ReviewSnapshotRecord> = emptyList(),
    val allocations: ProjectAllocationLedger? = null,
)

data class MutationResult<T>(val value: T, val version: Long, val changeSequence: Long)

data class ProjectSummary(
    val id: String,
    val name: String,
    val slug: String,
    val languages: List<String>,
    val defaultLanguage: String,
    val version: Long,
    val updatedAt: String,
)

data class ProjectOverview(
    val project: ProjectRecord,
    val scenes: List<SceneRecord>,
    val conversations: List<ConversationRecord>,
    val characters: List<CharacterRecord>,
    val variables: List<VariableRecord>,
)

class VersionConflictException(val expected: Long, val actual: Long) :
    IllegalStateException("Project changed: expected version $expected, current version $actual")

class InvalidProjectException(message: String) : IllegalArgumentException(message)
