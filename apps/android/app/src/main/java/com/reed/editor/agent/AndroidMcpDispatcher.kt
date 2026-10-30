package com.reed.editor.agent

import com.reed.core.NodeKind
import com.reed.core.GameLanguages
import com.reed.core.ProjectSnapshot
import com.reed.core.ReedCore
import com.reed.core.TextStatus
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonArray
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.double
import kotlinx.serialization.json.encodeToJsonElement
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.long
import kotlinx.serialization.json.put

/** MCP JSON-RPC adapter. Every project read and mutation stays inside Android ReedCore. */
class AndroidMcpDispatcher(
    private val core: ReedCore,
    private val projectId: String,
    private val onMutation: () -> Unit = {},
) {
    private val json = Json { encodeDefaults = true; explicitNulls = true }

    fun dispatch(message: JsonElement): JsonElement? {
        val request = message as? JsonObject ?: return rpcError(JsonNull, -32600, "Invalid Request")
        val id = request["id"] ?: JsonNull
        val method = request["method"]?.jsonPrimitive?.contentOrNull
            ?: return rpcError(id, -32600, "Missing method")
        if (id is JsonNull && method.startsWith("notifications/")) return null
        return try {
            when (method) {
                "initialize" -> rpcResult(id, initializeResult(request["params"] as? JsonObject))
                "ping" -> rpcResult(id, buildJsonObject {})
                "tools/list" -> rpcResult(id, buildJsonObject { put("tools", JsonArray(tools)) })
                "tools/call" -> {
                    val params = request["params"]?.jsonObject ?: error("Missing tool call params")
                    val name = params.string("name")
                    val arguments = params["arguments"] as? JsonObject ?: buildJsonObject {}
                    val result = runCatching { callTool(name, arguments) }
                        .fold(
                            onSuccess = { toolSuccess(it) },
                            onFailure = { toolError(it) },
                        )
                    rpcResult(id, result)
                }
                "resources/list" -> rpcResult(id, buildJsonObject {
                    put("resources", buildJsonArray {
                        add(buildJsonObject {
                            put("uri", "reed://schema")
                            put("name", "Reed schema")
                            put("mimeType", "application/json")
                        })
                    })
                })
                "resources/read" -> rpcResult(id, buildJsonObject {
                    put("contents", buildJsonArray {
                        add(buildJsonObject {
                            put("uri", "reed://schema")
                            put("mimeType", "application/json")
                            put("text", json.encodeToString(schemaDescriptor()))
                        })
                    })
                })
                else -> rpcError(id, -32601, "Method not found: $method")
            }
        } catch (error: Exception) {
            rpcError(id, -32603, error.message ?: "Unexpected Reed error")
        }
    }

    private fun initializeResult(params: JsonObject?): JsonObject {
        val requested = params?.get("protocolVersion")?.jsonPrimitive?.contentOrNull
        val protocol = requested?.takeIf { it in SUPPORTED_PROTOCOLS } ?: "2025-06-18"
        return buildJsonObject {
            put("protocolVersion", protocol)
            put("capabilities", buildJsonObject {
                put("tools", buildJsonObject { put("listChanged", false) })
                put("resources", buildJsonObject { put("subscribe", false); put("listChanged", false) })
            })
            put("serverInfo", buildJsonObject { put("name", "reed-android"); put("version", "0.2.3") })
            put("instructions", "Edit only the active local Reed project. Read versions before writes. Git is not available through Remote Agent Access.")
        }
    }

    private fun callTool(name: String, arguments: JsonObject): JsonElement {
        // Serializing the whole project is only needed by read tools; mutations skip it.
        val snapshot by lazy { core.exportSnapshot(projectId) }
        val value = when (name) {
            "get_schema" -> schemaDescriptor()
            "list_projects" -> json.encodeToJsonElement(listOf(snapshot.project))
            "list_scenes" -> json.encodeToJsonElement(snapshot.scenes)
            "list_conversations" -> {
                val sceneId = arguments.optionalString("sceneId")
                json.encodeToJsonElement(snapshot.conversations.filter { sceneId == null || it.sceneId == sceneId }.map { it.asRecord() })
            }
            "get_conversation" -> json.encodeToJsonElement(core.conversationGraph(arguments.string("conversationId")))
            "list_characters" -> json.encodeToJsonElement(snapshot.characters)
            "list_variables" -> json.encodeToJsonElement(snapshot.variables)
            "find_lines" -> findLines(snapshot, arguments)
            "get_validation_report" -> validationReport(snapshot)
            "update_project" -> {
                val result = core.updateProjectLanguages(
                    projectId = projectId,
                    languages = arguments.optionalStringArray("languages") ?: snapshot.project.languages,
                    defaultLanguage = arguments.optionalString("defaultLanguage") ?: snapshot.project.defaultLanguage,
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "create_scene" -> {
                val result = core.createScene(
                    projectId = projectId,
                    name = arguments.string("name"),
                    slug = arguments.string("slug"),
                    beatRef = arguments.optionalString("beatRef") ?: "",
                    sortOrder = arguments.optionalInt("sortOrder") ?: snapshot.scenes.size,
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "create_conversation" -> {
                val result = core.createConversation(
                    projectId = projectId,
                    sceneId = arguments.string("sceneId"),
                    title = arguments.string("title"),
                    description = arguments.optionalString("description") ?: "",
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "add_dialogue_node" -> addNode(arguments)
            "update_node_text", "set_line_text" -> {
                val lineId = arguments.string("lineId")
                val language = arguments.string("language")
                // An omitted menuText keeps the current choice label, as on desktop.
                val menuText = if (arguments.containsKey("menuText")) arguments.optionalString("menuText")
                else core.nodeByLineId(projectId, lineId).texts.firstOrNull { it.language == language }?.menuText
                val result = core.setNodeText(
                    projectId, lineId, language, arguments.string("text"),
                    menuText, arguments.long("expectedVersion"), "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "set_node_menu_text" -> {
                val lineId = arguments.string("lineId")
                val language = arguments.string("language")
                val existing = core.nodeByLineId(projectId, lineId).texts.firstOrNull { it.language == language }?.text.orEmpty()
                val result = core.setNodeText(
                    projectId, lineId, language, existing, arguments.string("menuText"),
                    arguments.long("expectedVersion"), "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "set_node_speaker" -> {
                val result = core.setNodeSpeaker(
                    projectId, arguments.string("lineId"), arguments.optionalString("characterId"),
                    arguments.long("expectedVersion"), "agent",
                )
                mutation(result.value?.let(::JsonPrimitive) ?: JsonNull, result.version, result.changeSequence)
            }
            "update_node", "set_node_conditions", "set_node_sequence", "add_tags" -> {
                val result = core.updateNode(
                    projectId = projectId,
                    lineId = arguments.string("lineId"),
                    sequence = arguments.optionalString("sequence"),
                    conditions = arguments.optionalString("conditions"),
                    userScript = arguments.optionalString("userScript"),
                    contextComment = arguments.optionalString("contextComment"),
                    voiceComment = arguments.optionalString("voiceComment"),
                    pronunciation = arguments.optionalString("pronunciation"),
                    tags = arguments.optionalStringArray("tags"),
                    isTerminal = arguments.optionalBoolean("isTerminal"),
                    x = arguments.optionalDouble("x"),
                    y = arguments.optionalDouble("y"),
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "set_line_status" -> {
                val status = TextStatus.valueOf(arguments.string("status").uppercase())
                val result = core.setLineStatus(
                    projectId, arguments.string("lineId"), status, arguments.long("expectedVersion"), "agent",
                )
                mutation(JsonPrimitive(result.value.name.lowercase()), result.version, result.changeSequence)
            }
            "link_nodes" -> {
                val origin = nodeForId(snapshot, arguments.string("originNodeId"))
                val destination = nodeForId(snapshot, arguments.string("destinationNodeId"))
                val result = core.linkNodes(
                    projectId, origin.lineId, destination.lineId, arguments.long("expectedVersion"), "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "unlink_nodes" -> {
                val result = core.unlinkNodes(
                    projectId, arguments.string("linkId"), arguments.long("expectedVersion"), "agent",
                )
                mutation(JsonPrimitive(result.value), result.version, result.changeSequence)
            }
            "delete_node" -> {
                val result = core.deleteNode(
                    projectId, arguments.string("lineId"), arguments.string("confirmation"),
                    arguments.long("expectedVersion"), "agent",
                )
                mutation(JsonPrimitive(result.value), result.version, result.changeSequence)
            }
            "upsert_character" -> {
                val displayNames = arguments["displayNames"]?.jsonObject?.mapValues { it.value.jsonPrimitive.content }
                    ?: emptyMap()
                val result = core.upsertCharacter(
                    projectId = projectId,
                    id = arguments.optionalString("id"),
                    name = arguments.string("name"),
                    displayNames = displayNames,
                    isPlayer = arguments.optionalBoolean("isPlayer") ?: false,
                    description = arguments.optionalString("description") ?: "",
                    actorNotes = arguments.optionalString("actorNotes") ?: "",
                    voiceNotes = arguments.optionalString("voiceNotes") ?: "",
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            "declare_variable" -> {
                val result = core.upsertVariable(
                    projectId = projectId,
                    id = null,
                    name = arguments.string("name"),
                    type = arguments.string("type"),
                    initialValue = arguments["initialValue"] ?: JsonNull,
                    description = arguments.optionalString("description") ?: "",
                    expectedVersion = arguments.long("expectedVersion"),
                    source = "agent",
                )
                mutation(json.encodeToJsonElement(result.value), result.version, result.changeSequence)
            }
            else -> error("Unknown Reed tool: $name")
        }
        if (name in MUTATING_TOOLS) onMutation()
        return value
    }

    private fun addNode(arguments: JsonObject): JsonElement = core.atomically { addNodeSteps(arguments) }

    private fun addNodeSteps(arguments: JsonObject): JsonElement {
        val kind = NodeKind.valueOf(arguments.optionalString("kind")?.uppercase() ?: "LINE")
        var result = core.createNode(
            projectId, arguments.string("conversationId"), kind,
            arguments.optionalDouble("x") ?: 0.0, arguments.optionalDouble("y") ?: 0.0,
            arguments.long("expectedVersion"), "agent",
        )
        var version = result.version
        var changeSequence = result.changeSequence
        val language = arguments.optionalString("language")
        val text = arguments.optionalString("text")
        val menuText = arguments.optionalString("menuText")
        if (text != null || menuText != null) {
            val project = core.projectOverview(projectId).project
            val textResult = core.setNodeText(
                projectId, result.value.lineId, language ?: project.defaultLanguage, text.orEmpty(), menuText,
                version, "agent",
            )
            version = textResult.version
            changeSequence = textResult.changeSequence
        }
        arguments.optionalString("speakerCharacterId")?.let { characterId ->
            val speakerResult = core.setNodeSpeaker(projectId, result.value.lineId, characterId, version, "agent")
            version = speakerResult.version
            changeSequence = speakerResult.changeSequence
        }
        return mutation(json.encodeToJsonElement(core.nodeByLineId(projectId, result.value.lineId)), version, changeSequence)
    }

    private fun findLines(snapshot: ProjectSnapshot, arguments: JsonObject): JsonElement {
        val query = arguments.optionalString("query").orEmpty()
        val characterId = arguments.optionalString("characterId")
        val limit = arguments.optionalInt("limit")?.coerceIn(1, 500) ?: 100
        val results = snapshot.conversations.asSequence().flatMap { graph ->
            graph.nodes.asSequence().filter { node ->
                (characterId == null || node.speakerCharacterId == characterId) &&
                    (query.isBlank() || node.lineId.contains(query, true) || node.texts.any { it.text.contains(query, true) || it.menuText.orEmpty().contains(query, true) })
            }.map { node -> buildJsonObject {
                put("conversationId", graph.id)
                put("lineId", node.lineId)
                put("kind", node.kind.name.lowercase())
                put("speakerCharacterId", node.speakerCharacterId?.let(::JsonPrimitive) ?: JsonNull)
                put("lineStatus", node.lineStatus.name.lowercase())
                put("texts", json.encodeToJsonElement(node.texts))
            } }
        }.take(limit).toList()
        return JsonArray(results)
    }

    private fun validationReport(snapshot: ProjectSnapshot): JsonObject {
        val issues = buildJsonArray {
            for (graph in snapshot.conversations) {
                val nodeIds = graph.nodes.map { it.id }.toSet()
                for (link in graph.links) if (link.originNodeId !in nodeIds || link.destinationNodeId !in nodeIds) {
                    add(issue("error", "broken-link", "Link ${link.id} references a missing node"))
                }
                for (node in graph.nodes.filter { it.kind != NodeKind.START }) {
                    val defaultText = node.texts.firstOrNull { it.language == snapshot.project.defaultLanguage }?.text.orEmpty()
                    if (defaultText.isBlank()) add(issue("warning", "missing-default-text", "${node.lineId} has no ${snapshot.project.defaultLanguage} text"))
                    if (node.kind == NodeKind.CHOICE && node.texts.none { !it.menuText.isNullOrBlank() }) {
                        add(issue("warning", "missing-choice-menu", "${node.lineId} has no choice menu text"))
                    }
                }
            }
        }
        return buildJsonObject {
            put("valid", issues.none { it.jsonObject["severity"]?.jsonPrimitive?.content == "error" })
            put("issues", issues)
            put("issueCount", issues.size)
        }
    }

    private fun issue(severity: String, code: String, message: String) = buildJsonObject {
        put("severity", severity); put("code", code); put("message", message)
    }

    private fun schemaDescriptor() = buildJsonObject {
        put("schemaVersion", 1)
        put("nodeKinds", JsonArray(NodeKind.entries.map { JsonPrimitive(it.name.lowercase()) }))
        put("textStatuses", JsonArray(TextStatus.entries.map { JsonPrimitive(it.name.lowercase()) }))
        put("agentMaximumTextStatus", "polished")
        put("languages", json.encodeToJsonElement(core.projectOverview(projectId).project.languages))
        put("languageTagStandard", "IETF BCP 47")
        put("gameLanguageCatalog", buildJsonArray {
            GameLanguages.catalog.forEach { language -> add(buildJsonObject {
                put("code", language.code); put("englishName", language.englishName); put("nativeName", language.nativeName)
                put("direction", if (language.rightToLeft) "rtl" else "ltr")
            }) }
        })
        put("transport", "remote-streamable-http-via-user-authorized-tablet-bridge")
        put("gitAvailable", false)
    }

    private fun mutation(value: JsonElement, version: Long, sequence: Long): JsonObject = buildJsonObject {
        put("value", value)
        put("version", version)
        put("changeSequence", sequence)
    }

    private fun toolSuccess(data: JsonElement) = buildJsonObject {
        put("content", buildJsonArray { add(buildJsonObject { put("type", "text"); put("text", json.encodeToString(buildJsonObject { put("ok", true); put("data", data) })) }) })
    }

    private fun toolError(error: Throwable) = buildJsonObject {
        put("isError", true)
        put("content", buildJsonArray { add(buildJsonObject {
            put("type", "text")
            put("text", json.encodeToString(buildJsonObject {
                put("ok", false)
                put("error", buildJsonObject {
                    put("code", error::class.simpleName ?: "REED_ERROR")
                    put("message", error.message ?: "Unexpected Reed error")
                })
            }))
        }) })
    }

    private val tools: List<JsonObject> by lazy {
        listOf(
            tool("get_schema", "Return Reed schema, language, and agent guardrail metadata."),
            tool("list_projects", "Return the active local project."),
            tool("list_scenes", "List scenes and permanent Line ID prefixes."),
            tool("list_conversations", "List conversations, optionally within a scene.", optional = mapOf("sceneId" to stringSchema())),
            tool("get_conversation", "Read a complete versioned conversation graph.", required = mapOf("conversationId" to stringSchema())),
            tool("list_characters", "List the cast registry."),
            tool("list_variables", "List declared dialogue variables."),
            tool("find_lines", "Search local dialogue text.", optional = mapOf("query" to stringSchema(), "characterId" to stringSchema(), "limit" to integerSchema())),
            tool("get_validation_report", "Validate the active project."),
            tool("update_project", "Update the active project's versioned language list and default writing language.", required = mapOf("expectedVersion" to integerSchema()), optional = mapOf("languages" to arraySchema(), "defaultLanguage" to stringSchema())),
            tool("create_scene", "Create an agent-sourced scene.", required = mapOf("name" to stringSchema(), "slug" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("beatRef" to stringSchema(), "sortOrder" to integerSchema())),
            tool("create_conversation", "Create a conversation with a permanent START node.", required = mapOf("sceneId" to stringSchema(), "title" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("description" to stringSchema())),
            tool("add_dialogue_node", "Add a Draft line, choice, or group/junction node.", required = mapOf("conversationId" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("kind" to enumSchema("line", "choice", "group"), "speakerCharacterId" to stringSchema(), "language" to stringSchema(), "text" to stringSchema(), "menuText" to stringSchema(), "x" to numberSchema(), "y" to numberSchema())),
            tool("update_node_text", "Set dialogue and optional menu text for one language.", required = mapOf("lineId" to stringSchema(), "language" to stringSchema(), "text" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("menuText" to stringSchema())),
            tool("set_line_text", "Alias for update_node_text.", required = mapOf("lineId" to stringSchema(), "language" to stringSchema(), "text" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("menuText" to stringSchema())),
            tool("set_node_menu_text", "Set only a choice menu label.", required = mapOf("lineId" to stringSchema(), "language" to stringSchema(), "menuText" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("set_node_speaker", "Assign a registered character as speaker.", required = mapOf("lineId" to stringSchema(), "characterId" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("update_node", "Update conditions, sequence, script, notes, tags, terminal state, or layout.", required = mapOf("lineId" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("sequence" to stringSchema(), "conditions" to stringSchema(), "userScript" to stringSchema(), "contextComment" to stringSchema(), "voiceComment" to stringSchema(), "pronunciation" to stringSchema(), "tags" to arraySchema(), "isTerminal" to booleanSchema(), "x" to numberSchema(), "y" to numberSchema())),
            tool("set_node_conditions", "Set Pixel Crushers Lua conditions.", required = mapOf("lineId" to stringSchema(), "conditions" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("set_node_sequence", "Set Pixel Crushers sequence commands.", required = mapOf("lineId" to stringSchema(), "sequence" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("add_tags", "Replace searchable production tags.", required = mapOf("lineId" to stringSchema(), "tags" to arraySchema(), "expectedVersion" to integerSchema())),
            tool("set_line_status", "Set agent-authored text no higher than Polished.", required = mapOf("lineId" to stringSchema(), "status" to enumSchema("placeholder", "draft", "polished", "rework"), "expectedVersion" to integerSchema())),
            tool("link_nodes", "Create a graph edge using node UUIDs.", required = mapOf("originNodeId" to stringSchema(), "destinationNodeId" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("unlink_nodes", "Remove a graph edge unless it touches Final content.", required = mapOf("linkId" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("delete_node", "Delete a non-Final node only when confirmation exactly matches its Line ID.", required = mapOf("lineId" to stringSchema(), "confirmation" to stringSchema(), "expectedVersion" to integerSchema())),
            tool("upsert_character", "Create or update a cast member with production notes.", required = mapOf("name" to stringSchema(), "expectedVersion" to integerSchema()), optional = mapOf("id" to stringSchema(), "displayNames" to objectSchema(), "isPlayer" to booleanSchema(), "description" to stringSchema(), "actorNotes" to stringSchema(), "voiceNotes" to stringSchema())),
            tool("declare_variable", "Create a boolean, number, or text dialogue variable.", required = mapOf("name" to stringSchema(), "type" to enumSchema("boolean", "number", "text"), "initialValue" to buildJsonObject {}, "expectedVersion" to integerSchema()), optional = mapOf("description" to stringSchema())),
        )
    }

    private fun tool(
        name: String,
        description: String,
        required: Map<String, JsonObject> = emptyMap(),
        optional: Map<String, JsonObject> = emptyMap(),
    ) = buildJsonObject {
        put("name", name)
        put("description", description)
        put("inputSchema", buildJsonObject {
            put("type", "object")
            put("properties", JsonObject(required + optional))
            if (required.isNotEmpty()) put("required", JsonArray(required.keys.map(::JsonPrimitive)))
            put("additionalProperties", false)
        })
    }

    private fun stringSchema() = buildJsonObject { put("type", "string") }
    private fun integerSchema() = buildJsonObject { put("type", "integer") }
    private fun numberSchema() = buildJsonObject { put("type", "number") }
    private fun booleanSchema() = buildJsonObject { put("type", "boolean") }
    private fun objectSchema() = buildJsonObject { put("type", "object"); put("additionalProperties", stringSchema()) }
    private fun arraySchema() = buildJsonObject { put("type", "array"); put("items", stringSchema()) }
    private fun enumSchema(vararg values: String) = buildJsonObject {
        put("type", "string"); put("enum", JsonArray(values.map(::JsonPrimitive)))
    }

    private fun nodeForId(snapshot: ProjectSnapshot, nodeId: String) = snapshot.conversations.asSequence()
        .flatMap { it.nodes.asSequence() }.firstOrNull { it.id == nodeId }
        ?: error("Node not found: $nodeId")

    private fun rpcResult(id: JsonElement, result: JsonElement) = buildJsonObject {
        put("jsonrpc", "2.0"); put("id", id); put("result", result)
    }

    private fun rpcError(id: JsonElement, code: Int, message: String) = buildJsonObject {
        put("jsonrpc", "2.0"); put("id", id); put("error", buildJsonObject { put("code", code); put("message", message) })
    }

    private fun JsonObject.string(name: String): String = this[name]?.jsonPrimitive?.contentOrNull
        ?: error("Missing required argument: $name")
    private fun JsonObject.long(name: String): Long = this[name]?.jsonPrimitive?.long
        ?: error("Missing required integer argument: $name")
    private fun JsonObject.optionalString(name: String): String? = this[name]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull
    private fun JsonObject.optionalInt(name: String): Int? = this[name]?.takeUnless { it is JsonNull }?.jsonPrimitive?.int
    private fun JsonObject.optionalDouble(name: String): Double? = this[name]?.takeUnless { it is JsonNull }?.jsonPrimitive?.double
    private fun JsonObject.optionalBoolean(name: String): Boolean? = this[name]?.takeUnless { it is JsonNull }?.jsonPrimitive?.contentOrNull?.toBooleanStrictOrNull()
    private fun JsonObject.optionalStringArray(name: String): List<String>? = this[name]?.takeUnless { it is JsonNull }?.jsonArray?.map { it.jsonPrimitive.content }

    companion object {
        private val SUPPORTED_PROTOCOLS = setOf("2025-06-18", "2025-03-26", "2024-11-05")
        private val MUTATING_TOOLS = setOf(
            "update_project", "create_scene", "create_conversation", "add_dialogue_node", "update_node_text", "set_line_text",
            "set_node_menu_text", "set_node_speaker", "update_node", "set_node_conditions", "set_node_sequence",
            "add_tags", "set_line_status", "link_nodes", "unlink_nodes", "delete_node", "upsert_character", "declare_variable",
        )
    }
}
