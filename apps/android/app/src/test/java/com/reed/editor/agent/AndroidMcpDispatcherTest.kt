package com.reed.editor.agent

import androidx.test.core.app.ApplicationProvider
import com.reed.core.ReedCore
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class AndroidMcpDispatcherTest {
    private lateinit var core: ReedCore
    private lateinit var dispatcher: AndroidMcpDispatcher
    private val json = Json

    @Before
    fun setup() {
        core = ReedCore(ApplicationProvider.getApplicationContext(), "mcp-${System.nanoTime()}.sqlite")
        val project = core.createProject("Tablet story", "tablet-story")
        dispatcher = AndroidMcpDispatcher(core, project.project.id)
    }

    @After
    fun teardown() = core.close()

    @Test
    fun exposesToolsAndMutatesUnicodeTextThroughCore() {
        val tools = dispatcher.dispatch(request(1, "tools/list", "{}"))!!.jsonObject
            .getValue("result").jsonObject.getValue("tools").jsonArray
        assertTrue(tools.any { it.jsonObject["name"]?.jsonPrimitive?.content == "add_dialogue_node" })
        assertFalse(tools.any { it.jsonObject["name"]?.jsonPrimitive?.content?.contains("git") == true })

        val snapshot = core.exportSnapshot(core.listProjects().single().id)
        val graph = snapshot.conversations.single()
        val added = toolCall(2, "add_dialogue_node", """{
            "conversationId":"${graph.id}","kind":"line","text":"Καλημέρα — buongiorno", "language":"en",
            "x":320,"y":180,"expectedVersion":${graph.version}
        }""")
        assertFalse(toolPayload(added).getValue("isError").jsonPrimitive.content.toBoolean())
        val refreshed = core.conversationGraph(graph.id)
        assertEquals("Καλημέρα — buongiorno", refreshed.nodes.last().texts.first { it.language == "en" }.text)
    }

    @Test
    fun agentCannotPromoteTextToFinal() {
        val snapshot = core.exportSnapshot(core.listProjects().single().id)
        val graph = snapshot.conversations.single()
        val node = core.createNode(snapshot.project.id, graph.id, com.reed.core.NodeKind.LINE, 0.0, 0.0, graph.version)
        val response = toolCall(3, "set_line_status", """{
            "lineId":"${node.value.lineId}","status":"final","expectedVersion":${node.version}
        }""")
        assertTrue(toolPayload(response).getValue("isError").jsonPrimitive.content.toBoolean())
    }

    private fun request(id: Int, method: String, params: String) = json.parseToJsonElement(
        """{"jsonrpc":"2.0","id":$id,"method":"$method","params":$params}""",
    )

    private fun toolCall(id: Int, name: String, arguments: String): JsonObject = dispatcher.dispatch(
        request(id, "tools/call", """{"name":"$name","arguments":$arguments}"""),
    )!!.jsonObject

    private fun toolPayload(response: JsonObject): JsonObject {
        val result = response.getValue("result").jsonObject
        if (result["isError"]?.jsonPrimitive?.content == "true") return buildMapPayload(true)
        val text = result.getValue("content").jsonArray.first().jsonObject.getValue("text").jsonPrimitive.content
        val payload = json.parseToJsonElement(text).jsonObject
        return JsonObject(payload + ("isError" to kotlinx.serialization.json.JsonPrimitive(false)))
    }

    private fun buildMapPayload(error: Boolean) = JsonObject(mapOf("isError" to kotlinx.serialization.json.JsonPrimitive(error)))
}
