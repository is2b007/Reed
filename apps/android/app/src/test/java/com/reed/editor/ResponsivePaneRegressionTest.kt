package com.reed.editor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class ResponsivePaneRegressionTest {
    private val source by lazy { mainActivitySource().readText() }

    @Test
    fun graphContentIsClippedToItsPane() {
        assertTrue(source.contains("modifier.clipToBounds().background(MaterialTheme.colorScheme.background)"))
    }

    @Test
    fun projectAndInspectorPanesHaveCollapseAndRestoreControls() {
        listOf(
            "Collapse project panel",
            "Show project panel",
            "Collapse inspector",
            "Show inspector",
        ).forEach { label -> assertTrue("Missing accessible pane action: $label", source.contains(label)) }
    }

    @Test
    fun checkboxRowsUseCheckboxSemanticsAndCrispVectorMarks() {
        assertTrue(source.contains("role = Role.Checkbox"))
        assertTrue(source.contains("private fun ReedCheckboxMark"))
        assertFalse(source.contains("☑"))
        assertFalse(source.contains("☐"))
    }

    private fun mainActivitySource(): File {
        var current = File(requireNotNull(System.getProperty("user.dir")))
        repeat(6) {
            val candidate = current.resolve("app/src/main/java/com/reed/editor/MainActivity.kt")
            if (candidate.isFile) return candidate
            current = current.parentFile ?: current
        }
        error("MainActivity.kt not found")
    }
}
