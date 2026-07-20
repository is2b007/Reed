package com.reed.editor

import com.reed.core.NodeKind
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import kotlin.math.abs

class AdaptiveLayoutTest {
    @Test
    fun dc1PortraitShowsProjectNavigationButDefersInspector() {
        val layout = workspaceLayoutForWidth(947)

        assertEquals(ReedWindowWidth.EXPANDED, layout.widthClass)
        assertTrue(layout.showProjectNavigator)
        assertFalse(layout.showNodeInspector)
        assertTrue(layout.showTopBarLabels)
    }

    @Test
    fun dc1LandscapeProvidesTheFullThreePaneWorkspace() {
        val layout = workspaceLayoutForWidth(1267)

        assertEquals(ReedWindowWidth.EXPANDED, layout.widthClass)
        assertTrue(layout.showProjectNavigator)
        assertTrue(layout.showNodeInspector)
    }

    @Test
    fun threePaneEditingIsReservedForTrulyExpandedWindows() {
        assertFalse(workspaceLayoutForWidth(1179).showNodeInspector)
        assertTrue(workspaceLayoutForWidth(1180).showNodeInspector)
    }

    @Test
    fun generatedProjectSlugsAreStableAndBounded() {
        assertEquals("the-salt-gate", projectSlug("  The Salt Gate  "))
        assertTrue(projectSlug("A".repeat(100)).length <= 63)
    }

    @Test
    fun nodeGeometryMatchesCompactCardKinds() {
        assertEquals(252f, nodeWidthDp(NodeKind.LINE))
        assertEquals(228f, nodeWidthDp(NodeKind.START))
        assertEquals(84f, nodeHeightDp(NodeKind.GROUP))
    }

    @Test
    fun newNodesAvoidTheStartCardAtDc1Widths() {
        assertEquals(NodePlacement(300.0, 96.0), nextNodePlacement(nodeCount = 1, canvasWidthDp = 520))
        assertEquals(NodePlacement(24.0, 260.0), nextNodePlacement(nodeCount = 1, canvasWidthDp = 400))
        assertEquals(NodePlacement(300.0, 286.0), nextNodePlacement(nodeCount = 2, canvasWidthDp = 520))
    }

    @Test
    fun connectionDropsConvertFromCanvasPixelsAndSnapTheNewNodeToTheGrid() {
        val graphDrop = graphPositionForCanvasPoint(
            canvasX = 440f,
            canvasY = 424f,
            panX = 40f,
            panY = 24f,
            scale = 1f,
            density = 2f,
        )

        assertEquals(NodePlacement(200.0, 200.0), graphDrop)
        assertEquals(NodePlacement(208.0, 128.0), connectedNodePlacement(graphDrop, NodeKind.LINE))
        assertEquals(NodePlacement(208.0, 160.0), connectedNodePlacement(graphDrop, NodeKind.GROUP))
    }

    @Test
    fun pinchZoomKeepsTheGraphPointUnderTheFingerCentroid() {
        val viewport = transformGraphViewport(
            panX = 40f,
            panY = 24f,
            scale = 1f,
            centroidX = 520f,
            centroidY = 315f,
            panChangeX = 20f,
            panChangeY = 15f,
            zoomChange = 1.5f,
        )

        // The point beneath the previous centroid (500, 300) follows the fingers
        // to the new centroid (520, 315) while the graph scales around it.
        assertClose(520f, 460f * viewport.scale + viewport.panX)
        assertClose(315f, 276f * viewport.scale + viewport.panY)
        assertClose(1.5f, viewport.scale)
    }

    @Test
    fun pinchZoomUsesTheAppliedScaleWhenClamped() {
        val viewport = transformGraphViewport(
            panX = 40f,
            panY = 24f,
            scale = 1.7f,
            centroidX = 500f,
            centroidY = 300f,
            panChangeX = 0f,
            panChangeY = 0f,
            zoomChange = 2f,
        )
        val graphXAtCentroid = (500f - 40f) / 1.7f
        val graphYAtCentroid = (300f - 24f) / 1.7f

        assertClose(1.8f, viewport.scale)
        assertClose(500f, graphXAtCentroid * viewport.scale + viewport.panX)
        assertClose(300f, graphYAtCentroid * viewport.scale + viewport.panY)
    }

    private fun assertClose(expected: Float, actual: Float) {
        assertTrue("Expected $expected, got $actual", abs(expected - actual) < 0.001f)
    }
}
