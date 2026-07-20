package com.reed.editor

import android.view.InputDevice
import android.view.MotionEvent
import android.view.View
import androidx.activity.ComponentActivity
import androidx.compose.foundation.gestures.detectDragGestures
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.material3.Text
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class StylusMarqueeInstrumentedTest {
    @get:Rule
    val composeRule = createAndroidComposeRule<ComponentActivity>()

    @Test
    fun stylusBarrelButtonDragOwnsTheMarqueeGesture() {
        var active by mutableStateOf(false)
        var phase by mutableStateOf("idle")
        var start: Offset? = null
        var drag: Offset? = null
        var end: Offset? = null
        var competingCanvasDrags = 0

        composeRule.setContent {
            Box(
                Modifier
                    .fillMaxSize()
                    .testTag("marquee-surface")
                    .observeStylusHover(
                        onHover = {},
                        onExit = {},
                        onButtonPress = { _, _ -> },
                        onSecondaryPointer = {},
                        isMarqueeSelectionActive = { active },
                        onMarqueeSelectionStart = {
                            active = true
                            start = it
                            phase = "started"
                        },
                        onMarqueeSelectionDrag = {
                            drag = it
                            phase = "dragged"
                        },
                        onMarqueeSelectionEnd = {
                            active = false
                            end = it
                            phase = "ended"
                        },
                        onMarqueeSelectionCancel = {
                            active = false
                            phase = "cancelled"
                        },
                    )
                    .pointerInput(active) {
                        if (!active) {
                            detectDragGestures { _, _ -> competingCanvasDrags += 1 }
                        }
                    },
            ) {
                Text(phase)
            }
        }

        val surfaceBounds = composeRule.onNodeWithTag("marquee-surface")
            .assertExists()
            .fetchSemanticsNode().boundsInRoot
        val rootLocation = IntArray(2)
        composeRule.activity.findViewById<View>(android.R.id.content).getLocationInWindow(rootLocation)
        val startX = rootLocation[0] + surfaceBounds.left + surfaceBounds.width * 0.25f
        val startY = rootLocation[1] + surfaceBounds.top + surfaceBounds.height * 0.25f
        val endX = rootLocation[0] + surfaceBounds.left + surfaceBounds.width * 0.75f
        val endY = rootLocation[1] + surfaceBounds.top + surfaceBounds.height * 0.75f
        val downTime = android.os.SystemClock.uptimeMillis()

        dispatchStylusEvent(MotionEvent.ACTION_DOWN, startX, startY, downTime)
        composeRule.waitForIdle()
        composeRule.onNodeWithText("started").assertExists()
        dispatchStylusEvent(MotionEvent.ACTION_MOVE, endX, endY, downTime)
        composeRule.waitForIdle()
        composeRule.onNodeWithText("dragged").assertExists()
        dispatchStylusEvent(MotionEvent.ACTION_UP, endX, endY, downTime)
        composeRule.waitForIdle()

        composeRule.runOnIdle {
            assertTrue("Stylus stream should end, but was $phase", phase == "ended")
        }
        assertNotNull(start)
        assertNotNull(drag)
        assertNotNull(end)
        assertTrue(end!!.x > start!!.x)
        assertTrue(end!!.y > start!!.y)
        assertTrue("Canvas drag must not run during pen marquee", competingCanvasDrags == 0)
    }

    private fun dispatchStylusEvent(action: Int, x: Float, y: Float, downTime: Long) {
        val pointerProperties = MotionEvent.PointerProperties().apply {
            id = 0
            toolType = MotionEvent.TOOL_TYPE_STYLUS
        }
        val pointerCoords = MotionEvent.PointerCoords().apply {
            this.x = x
            this.y = y
            pressure = if (action == MotionEvent.ACTION_UP) 0f else 0.5f
            size = 0.1f
        }
        val event = MotionEvent.obtain(
            downTime,
            android.os.SystemClock.uptimeMillis(),
            action,
            1,
            arrayOf(pointerProperties),
            arrayOf(pointerCoords),
            0,
            MotionEvent.BUTTON_STYLUS_PRIMARY,
            1f,
            1f,
            0,
            0,
            InputDevice.SOURCE_STYLUS,
            0,
        )
        try {
            var handled = false
            composeRule.runOnUiThread {
                handled = composeRule.activity.dispatchTouchEvent(event)
            }
            assertTrue("Stylus event should be handled", handled)
        } finally {
            event.recycle()
        }
    }
}
