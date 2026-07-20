package com.reed.editor

import androidx.compose.ui.geometry.Offset
import com.reed.core.DialogueNodeRecord
import com.reed.core.NodeKind
import com.reed.core.TextStatus
import com.reed.core.VoiceStatus
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class StylusSupportTest {
    @Test
    fun hoverHitTestingAccountsForCanvasPanAndZoom() {
        val line = node("line", NodeKind.LINE, 100.0, 80.0)
        val pan = Offset(40f, 24f)
        val scale = 1.5f

        assertEquals("line", stylusHitTest(listOf(line), Offset(240f, 174f), pan, scale))
        assertNull(stylusHitTest(listOf(line), Offset(20f, 20f), pan, scale))
    }

    @Test
    fun hoverHitTestingAccountsForDisplayDensity() {
        val line = node("line", NodeKind.LINE, 100.0, 80.0)

        assertEquals("line", stylusHitTest(listOf(line), Offset(400f, 240f), Offset.Zero, 1f, density = 2f))
        assertNull(stylusHitTest(listOf(line), Offset(60f, 60f), Offset.Zero, 1f, density = 2f))
    }

    @Test
    fun topmostNodeWinsWhenHoverTargetsOverlap() {
        val back = node("back", NodeKind.LINE, 100.0, 100.0)
        val front = node("front", NodeKind.CHOICE, 120.0, 110.0)

        assertEquals("front", stylusHitTest(listOf(back, front), Offset(160f, 150f), Offset.Zero, 1f))
    }

    @Test
    fun junctionUsesItsCompactHoverBounds() {
        val junction = node("junction", NodeKind.GROUP, 200.0, 200.0)

        assertEquals("junction", stylusHitTest(listOf(junction), Offset(400f, 280f), Offset.Zero, 1f))
        assertNull(stylusHitTest(listOf(junction), Offset(400f, 310f), Offset.Zero, 1f))
    }

    @Test
    fun outputPortKeepsAFullTouchTargetAtEveryZoomLevel() {
        val line = node("line", NodeKind.LINE, 100.0, 80.0)
        val center = nodeOutputPortCenter(line, Offset(40f, 24f), scale = 0.55f, density = 2f)

        assertEquals("line", outputPortHitTest(listOf(line), center + Offset(47f, 0f), Offset(40f, 24f), 0.55f, density = 2f))
        assertNull(outputPortHitTest(listOf(line), center + Offset(49f, 0f), Offset(40f, 24f), 0.55f, density = 2f))
    }

    @Test
    fun penMarqueeNormalizesDragDirectionAndUsesPartialIntersection() {
        val line = node("line", NodeKind.LINE, 100.0, 80.0)
        val distant = node("distant", NodeKind.LINE, 500.0, 500.0)
        val nodes = listOf(line, distant)

        assertEquals(
            setOf("line"),
            marqueeSelectionIds(
                nodes,
                start = Offset(800f, 520f),
                end = Offset(200f, 150f),
                pan = Offset(40f, 24f),
                scale = 1f,
                density = 2f,
            ),
        )
        assertEquals(
            setOf("line"),
            marqueeSelectionIds(
                nodes,
                start = Offset(735f, 210f),
                end = Offset(770f, 260f),
                pan = Offset(40f, 24f),
                scale = 1f,
                density = 2f,
            ),
        )
    }

    private fun node(id: String, kind: NodeKind, x: Double, y: Double) = DialogueNodeRecord(
        id = id,
        conversationId = "conversation",
        lineId = "line_$id",
        entryNumericId = 1,
        kind = kind,
        spokenLanguage = "en",
        lineStatus = TextStatus.DRAFT,
        voiceStatus = VoiceStatus.NONE,
        x = x,
        y = y,
        createdAt = "2026-07-18T00:00:00Z",
        updatedAt = "2026-07-18T00:00:00Z",
    )
}
