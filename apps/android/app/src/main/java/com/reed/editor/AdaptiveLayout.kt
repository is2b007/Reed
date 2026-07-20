package com.reed.editor

import com.reed.core.NodeKind
import kotlin.math.roundToInt

/**
 * Window decisions are derived from the app's current width, not the physical display.
 * This keeps Reed usable in rotation, split screen, and freeform windows on the DC-1.
 */
internal enum class ReedWindowWidth { COMPACT, MEDIUM, EXPANDED }

internal data class ReedWorkspaceLayout(
    val widthClass: ReedWindowWidth,
    val showProjectNavigator: Boolean,
    val showNodeInspector: Boolean,
    val showTopBarLabels: Boolean,
)

internal fun workspaceLayoutForWidth(widthDp: Int): ReedWorkspaceLayout {
    val widthClass = when {
        widthDp < 600 -> ReedWindowWidth.COMPACT
        widthDp < 840 -> ReedWindowWidth.MEDIUM
        else -> ReedWindowWidth.EXPANDED
    }
    return ReedWorkspaceLayout(
        widthClass = widthClass,
        showProjectNavigator = widthDp >= 720,
        showNodeInspector = widthDp >= 1180,
        showTopBarLabels = widthDp >= 520,
    )
}

internal fun projectSlug(value: String): String = value
    .lowercase()
    .replace(Regex("[^a-z0-9]+"), "-")
    .trim('-')
    .take(63)

internal const val NODE_STANDARD_WIDTH_DP = 252f
internal const val NODE_START_WIDTH_DP = 228f
internal const val NODE_JUNCTION_WIDTH_DP = 200f

internal fun nodeWidthDp(kind: com.reed.core.NodeKind): Float = when (kind) {
    com.reed.core.NodeKind.START -> NODE_START_WIDTH_DP
    com.reed.core.NodeKind.GROUP -> NODE_JUNCTION_WIDTH_DP
    com.reed.core.NodeKind.LINE,
    com.reed.core.NodeKind.CHOICE -> NODE_STANDARD_WIDTH_DP
}

internal fun nodeHeightDp(kind: com.reed.core.NodeKind): Float = when (kind) {
    com.reed.core.NodeKind.START -> 136f
    com.reed.core.NodeKind.GROUP -> 84f
    com.reed.core.NodeKind.LINE -> 156f
    com.reed.core.NodeKind.CHOICE -> 172f
}

internal data class NodePlacement(val x: Double, val y: Double)

internal data class GraphViewport(
    val panX: Float,
    val panY: Float,
    val scale: Float,
)

/**
 * Applies a pan/zoom gesture while keeping the graph point beneath the gesture
 * centroid anchored to that centroid. Pan is stored in screen pixels because
 * graph nodes and links are rendered as `screen = graph * scale + pan`.
 */
internal fun transformGraphViewport(
    panX: Float,
    panY: Float,
    scale: Float,
    centroidX: Float,
    centroidY: Float,
    panChangeX: Float,
    panChangeY: Float,
    zoomChange: Float,
    minScale: Float = 0.55f,
    maxScale: Float = 1.8f,
): GraphViewport {
    require(scale > 0f) { "Scale must be positive" }
    require(zoomChange > 0f) { "Zoom change must be positive" }
    require(minScale > 0f && maxScale >= minScale) { "Scale bounds must be positive and ordered" }

    val newScale = (scale * zoomChange).coerceIn(minScale, maxScale)
    val appliedZoom = newScale / scale
    return GraphViewport(
        panX = centroidX + (panX + panChangeX - centroidX) * appliedZoom,
        panY = centroidY + (panY + panChangeY - centroidY) * appliedZoom,
        scale = newScale,
    )
}

internal fun nextNodePlacement(nodeCount: Int, canvasWidthDp: Int): NodePlacement {
    val authoredIndex = (nodeCount - 1).coerceAtLeast(0)
    return if (canvasWidthDp < 480) {
        NodePlacement(x = 24.0, y = 260.0 + authoredIndex * 184.0)
    } else {
        NodePlacement(x = 300.0, y = 96.0 + authoredIndex * 190.0)
    }
}

internal fun graphPositionForCanvasPoint(
    canvasX: Float,
    canvasY: Float,
    panX: Float,
    panY: Float,
    scale: Float,
    density: Float,
): NodePlacement {
    require(scale > 0f) { "Scale must be positive" }
    require(density > 0f) { "Density must be positive" }
    return NodePlacement(
        x = ((canvasX - panX) / scale / density).toDouble(),
        y = ((canvasY - panY) / scale / density).toDouble(),
    )
}

internal fun connectedNodePlacement(drop: NodePlacement, kind: NodeKind): NodePlacement {
    fun snap(value: Double): Double = (value / 16.0).roundToInt() * 16.0
    return NodePlacement(
        x = snap(drop.x),
        y = snap(drop.y - nodeHeightDp(kind) / 2.0),
    )
}
