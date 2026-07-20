package com.reed.editor

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ConnectionDragRegressionTest {
    @Test
    fun outputPortDragSupportsExistingAndBlankCanvasDestinations() {
        val source = projectFile("app/src/main/java/com/reed/editor/MainActivity.kt").readText()

        assertTrue(source.contains("outputPortHitTest(nodes, down.position"))
        assertTrue(source.contains("viewModel.connectNodes(sourceNodeId, targetNodeId)"))
        assertTrue(source.contains("ConnectionCreateRequest("))
        assertTrue(source.contains("private fun ConnectionCreatePicker("))
        assertTrue(source.contains("Output connection port for \${node.lineId}. Drag to connect"))
    }

    @Test
    fun connectedCreationUsesTheCreatedVersionBeforeLinking() {
        val source = projectFile("app/src/main/java/com/reed/editor/ReedViewModel.kt").readText()
        val method = source.substringAfter("fun createConnectedNode(").substringBefore("fun deleteNode(")

        assertTrue(method.contains("core.createNode("))
        assertTrue(method.contains("core.linkNodes("))
        assertTrue(method.contains("created.version"))
        assertTrue(method.indexOf("core.createNode(") < method.indexOf("core.linkNodes("))
    }

    private fun projectFile(relativePath: String): File {
        var current = File(requireNotNull(System.getProperty("user.dir")))
        repeat(6) {
            val candidate = current.resolve(relativePath)
            if (candidate.isFile) return candidate
            current = current.parentFile ?: current
        }
        error("Project file not found: $relativePath")
    }
}
