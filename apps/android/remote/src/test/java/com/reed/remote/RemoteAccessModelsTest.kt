package com.reed.remote

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.assertThrows
import org.junit.Test

class RemoteAccessModelsTest {
    @Test
    fun connectorUrlIsStableAndCapabilityScoped() {
        val credentials = RemoteAccessCredentials(
            channelId = "reed_0123456789abcdefghijklmnopqrstuv",
            deviceToken = "rdv_0123456789abcdefghijklmnopqrstuv",
            connectorToken = "rcc_0123456789abcdefghijklmnopqrstuv",
        )
        val configuration = RemoteAccessConfiguration(
            relayBaseUrl = "https://relay.reed.example/",
            projectId = "project-1",
            projectName = "Καλάμι",
            credentials = credentials,
            expiresAtEpochMs = 1_000,
        )
        assertEquals("https://relay.reed.example", configuration.normalizedRelayBaseUrl)
        assertTrue(configuration.connectorUrl.endsWith("/mcp/${credentials.channelId}?access_token=${credentials.connectorToken}"))
    }

    @Test
    fun relayRequiresHttpsAndNoEmbeddedCredentialsOrPath() {
        assertThrows(IllegalArgumentException::class.java) { normalizeRelayBaseUrl("http://relay.example") }
        assertThrows(IllegalArgumentException::class.java) { normalizeRelayBaseUrl("https://user:pass@relay.example") }
        assertThrows(IllegalArgumentException::class.java) { normalizeRelayBaseUrl("https://relay.example/private") }
    }
}
