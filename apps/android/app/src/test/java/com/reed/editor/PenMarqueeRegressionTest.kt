package com.reed.editor

import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class PenMarqueeRegressionTest {
    @Test
    fun stylusSideButtonDragOwnsTheMarqueeGesture() {
        val source = projectFile("app/src/main/java/com/reed/editor/StylusSupport.kt").readText()

        assertTrue(source.contains("MotionEvent.BUTTON_STYLUS_PRIMARY"))
        assertTrue(source.contains("MotionEvent.BUTTON_STYLUS_SECONDARY"))
        assertTrue(source.contains("MotionEvent.ACTION_DOWN && tool == StylusTool.PEN && sideButtonPressed"))
        assertTrue(source.contains("onMarqueeSelectionDrag(sample.position)"))
        assertTrue(source.contains("onMarqueeSelectionEnd(sample.position)"))
    }

    @Test
    fun graphRendersAndCommitsTheLiveMultiSelection() {
        val activity = projectFile("app/src/main/java/com/reed/editor/MainActivity.kt").readText()
        val viewModel = projectFile("app/src/main/java/com/reed/editor/ReedViewModel.kt").readText()

        assertTrue(activity.contains("ActiveMarqueeSelection"))
        assertTrue(activity.contains("viewModel.selectNodes(completed.selectedNodeIds)"))
        assertTrue(activity.contains("pointerInput(graph?.id, marqueeSelection != null)"))
        assertTrue(activity.contains("marqueeSelectionActive = marqueeSelection != null"))
        assertTrue(activity.contains("if (marqueeSelection != null) return@awaitEachGesture"))
        assertTrue(activity.contains("Pen marquee, \${selection.selectedNodeIds.size} nodes selected"))
        assertTrue(activity.contains("event.isShiftPressed && event.key == Key.Enter"))
        assertTrue(viewModel.contains("val selectedNodeIds: Set<String>"))
        assertTrue(viewModel.contains("fun selectNodes(ids: Set<String>)"))
        assertTrue(viewModel.contains("fun toggleNodeSelection(id: String)"))
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
