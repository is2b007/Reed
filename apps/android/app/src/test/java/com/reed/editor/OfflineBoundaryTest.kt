package com.reed.editor

import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class OfflineBoundaryTest {
    @Test
    fun outboundNetworkCodeIsIsolatedToExplicitGitAndAgentAccessBoundaries() {
        val root = locateAndroidRoot()
        val appAndCore = listOf(root.resolve("app/src/main"), root.resolve("core/src/main"))
            .flatMap { directory -> directory.walkTopDown().filter { it.isFile && it.extension in setOf("kt", "java") }.toList() }
            .joinToString("\n") { it.readText() }
        val git = root.resolve("git/src/main/java/com/reed/git/GitRepositoryService.kt").readText()
        val remote = root.resolve("remote/src/main/java/com/reed/remote/RelayBridgeClient.kt").readText()
        val controller = root.resolve("app/src/main/java/com/reed/editor/agent/RemoteAgentAccessController.kt").readText()
        val service = root.resolve("app/src/main/java/com/reed/editor/agent/RemoteAgentService.kt").readText()
        val manifest = root.resolve("app/src/main/AndroidManifest.xml").readText()

        listOf("java.net.", "okhttp", "retrofit", "HttpURLConnection", "ktor.client").forEach { forbidden ->
            assertFalse("Unexpected network client outside Git boundary: $forbidden", appAndCore.contains(forbidden))
        }
        listOf("suspend fun clone", "suspend fun fetch", "suspend fun pullFastForward", "suspend fun push", "suspend fun sync").forEach {
            assertTrue("Missing explicit Git action $it", git.contains(it))
        }
        assertTrue("Remote transport must remain isolated", remote.contains("HttpURLConnection"))
        assertTrue("Agent access must start only from an explicit foreground-service action", controller.contains("startForegroundService"))
        assertTrue("Agent access must expose a notification disconnect action", service.contains("ACTION_STOP"))
        assertTrue("Agent access service must survive the activity and remain visible", manifest.contains("android:stopWithTask=\"false\"") && manifest.contains("foregroundServiceType=\"specialUse\""))
        assertFalse("The application must not start Agent Access during initialization", root.resolve("app/src/main/java/com/reed/editor/ReedApplication.kt").readText().contains("agentAccess.start("))
    }

    private fun locateAndroidRoot(): File {
        var current = File(requireNotNull(System.getProperty("user.dir")))
        repeat(6) {
            if (current.resolve("settings.gradle.kts").isFile && current.resolve("app").isDirectory) return current
            current = current.parentFile ?: current
        }
        error("Android project root not found")
    }
}
