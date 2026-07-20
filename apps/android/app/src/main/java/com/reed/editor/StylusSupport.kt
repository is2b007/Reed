package com.reed.editor

import android.view.MotionEvent
import androidx.compose.ui.ExperimentalComposeUiApi
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Rect
import androidx.compose.ui.input.pointer.pointerInteropFilter
import com.reed.core.DialogueNodeRecord
import com.reed.core.NodeKind

enum class StylusTool { PEN, ERASER }
enum class StylusButton { PRIMARY, SECONDARY }

data class StylusHoverSample(
    val position: Offset,
    val distance: Float,
    val orientation: Float,
    val tilt: Float,
    val tool: StylusTool,
    val primaryButtonPressed: Boolean,
    val secondaryButtonPressed: Boolean,
)

/**
 * Handles Android stylus proximity at the canvas boundary while leaving contact, drag, touch, and scroll to Compose.
 * Daylight's Wacom EMR stack reports hover through MotionEvent ACTION_HOVER_* and AXIS_DISTANCE.
 */
@OptIn(ExperimentalComposeUiApi::class)
fun Modifier.observeStylusHover(
    onHover: (StylusHoverSample) -> Unit,
    onExit: () -> Unit,
    onButtonPress: (StylusHoverSample, StylusButton) -> Unit,
    onSecondaryPointer: (Offset) -> Unit,
    isMarqueeSelectionActive: () -> Boolean = { false },
    onMarqueeSelectionStart: (Offset) -> Unit = {},
    onMarqueeSelectionDrag: (Offset) -> Unit = {},
    onMarqueeSelectionEnd: (Offset) -> Unit = {},
    onMarqueeSelectionCancel: () -> Unit = {},
): Modifier = pointerInteropFilter { event ->
    val pointerIndex = event.actionIndex.coerceIn(0, event.pointerCount - 1)
    if (event.getToolType(pointerIndex) == MotionEvent.TOOL_TYPE_MOUSE) {
        val secondary = event.actionButton == MotionEvent.BUTTON_SECONDARY ||
            event.buttonState and MotionEvent.BUTTON_SECONDARY != 0
        if (secondary && (event.actionMasked == MotionEvent.ACTION_BUTTON_PRESS || event.actionMasked == MotionEvent.ACTION_DOWN)) {
            onSecondaryPointer(Offset(event.getX(pointerIndex), event.getY(pointerIndex)))
            return@pointerInteropFilter true
        }
        return@pointerInteropFilter false
    }
    val tool = when (event.getToolType(pointerIndex)) {
        MotionEvent.TOOL_TYPE_STYLUS -> StylusTool.PEN
        MotionEvent.TOOL_TYPE_ERASER -> StylusTool.ERASER
        else -> return@pointerInteropFilter false
    }
    val sample = StylusHoverSample(
        position = Offset(event.getX(pointerIndex), event.getY(pointerIndex)),
        distance = event.getAxisValue(MotionEvent.AXIS_DISTANCE, pointerIndex).coerceAtLeast(0f),
        orientation = event.getAxisValue(MotionEvent.AXIS_ORIENTATION, pointerIndex),
        tilt = event.getAxisValue(MotionEvent.AXIS_TILT, pointerIndex),
        tool = tool,
        primaryButtonPressed = event.buttonState and MotionEvent.BUTTON_STYLUS_PRIMARY != 0,
        secondaryButtonPressed = event.buttonState and MotionEvent.BUTTON_STYLUS_SECONDARY != 0 ||
            event.buttonState and MotionEvent.BUTTON_SECONDARY != 0,
    )
    val sideButtonPressed = event.buttonState and (
        MotionEvent.BUTTON_STYLUS_PRIMARY or MotionEvent.BUTTON_STYLUS_SECONDARY or MotionEvent.BUTTON_SECONDARY
    ) != 0
    when {
        event.actionMasked == MotionEvent.ACTION_DOWN && tool == StylusTool.PEN && sideButtonPressed -> {
            onMarqueeSelectionStart(sample.position)
            return@pointerInteropFilter true
        }
        event.actionMasked == MotionEvent.ACTION_MOVE && isMarqueeSelectionActive() -> {
            onMarqueeSelectionDrag(sample.position)
            return@pointerInteropFilter true
        }
        event.actionMasked == MotionEvent.ACTION_UP && isMarqueeSelectionActive() -> {
            onMarqueeSelectionEnd(sample.position)
            return@pointerInteropFilter true
        }
        event.actionMasked == MotionEvent.ACTION_BUTTON_RELEASE && isMarqueeSelectionActive() -> {
            onMarqueeSelectionEnd(sample.position)
            return@pointerInteropFilter true
        }
        event.actionMasked == MotionEvent.ACTION_CANCEL && isMarqueeSelectionActive() -> {
            onMarqueeSelectionCancel()
            return@pointerInteropFilter true
        }
    }
    when (event.actionMasked) {
        MotionEvent.ACTION_HOVER_ENTER,
        MotionEvent.ACTION_HOVER_MOVE -> {
            onHover(sample)
            true
        }

        MotionEvent.ACTION_HOVER_EXIT -> {
            onExit()
            true
        }

        MotionEvent.ACTION_BUTTON_PRESS -> {
            val button = when (event.actionButton) {
                MotionEvent.BUTTON_STYLUS_SECONDARY, MotionEvent.BUTTON_SECONDARY -> StylusButton.SECONDARY
                else -> StylusButton.PRIMARY
            }
            onButtonPress(sample, button)
            true
        }
        else -> false
    }
}

internal fun stylusHitTest(
    nodes: List<DialogueNodeRecord>,
    screenPosition: Offset,
    pan: Offset,
    scale: Float,
    density: Float = 1f,
): String? {
    if (scale <= 0f || density <= 0f) return null
    val graphX = (screenPosition.x - pan.x) / scale / density
    val graphY = (screenPosition.y - pan.y) / scale / density
    return nodes.asReversed().firstOrNull { node ->
        val width = nodeWidthDp(node.kind)
        val height = nodeHeightDp(node.kind)
        graphX in (node.x.toFloat() - 8f)..(node.x.toFloat() + width + 8f) &&
            graphY in (node.y.toFloat() - 8f)..(node.y.toFloat() + height + 8f)
    }?.id
}

internal fun nodeOutputPortCenter(
    node: DialogueNodeRecord,
    pan: Offset,
    scale: Float,
    density: Float = 1f,
): Offset = Offset(
    x = (node.x.toFloat() + nodeWidthDp(node.kind) - 24f) * density * scale + pan.x,
    y = (node.y.toFloat() + nodeHeightDp(node.kind) / 2f) * density * scale + pan.y,
)

internal fun outputPortHitTest(
    nodes: List<DialogueNodeRecord>,
    screenPosition: Offset,
    pan: Offset,
    scale: Float,
    density: Float = 1f,
    hitSizeDp: Float = 48f,
): String? {
    if (scale <= 0f || density <= 0f || hitSizeDp <= 0f) return null
    val halfHitSize = hitSizeDp * density / 2f
    return nodes.asReversed().firstOrNull { node ->
        val center = nodeOutputPortCenter(node, pan, scale, density)
        screenPosition.x in (center.x - halfHitSize)..(center.x + halfHitSize) &&
            screenPosition.y in (center.y - halfHitSize)..(center.y + halfHitSize)
    }?.id
}

internal fun marqueeBounds(start: Offset, end: Offset): Rect = Rect(
    left = minOf(start.x, end.x),
    top = minOf(start.y, end.y),
    right = maxOf(start.x, end.x),
    bottom = maxOf(start.y, end.y),
)

internal fun marqueeSelectionIds(
    nodes: List<DialogueNodeRecord>,
    start: Offset,
    end: Offset,
    pan: Offset,
    scale: Float,
    density: Float = 1f,
): Set<String> {
    if (scale <= 0f || density <= 0f) return emptySet()
    val selection = marqueeBounds(start, end)
    return nodes.filterTo(linkedSetOf()) { node ->
        val left = node.x.toFloat() * density * scale + pan.x
        val top = node.y.toFloat() * density * scale + pan.y
        val right = (node.x.toFloat() + nodeWidthDp(node.kind)) * density * scale + pan.x
        val bottom = (node.y.toFloat() + nodeHeightDp(node.kind)) * density * scale + pan.y
        selection.left <= right && selection.right >= left && selection.top <= bottom && selection.bottom >= top
    }.mapTo(linkedSetOf()) { it.id }
}
