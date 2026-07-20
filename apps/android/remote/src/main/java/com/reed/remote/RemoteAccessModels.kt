package com.reed.remote

import kotlinx.serialization.Serializable
import java.net.URI

@Serializable
data class RemoteAccessCredentials(
    val channelId: String,
    val deviceToken: String,
    val connectorToken: String,
)

data class RemoteAccessConfiguration(
    val relayBaseUrl: String,
    val projectId: String,
    val projectName: String,
    val credentials: RemoteAccessCredentials,
    val expiresAtEpochMs: Long,
) {
    val normalizedRelayBaseUrl: String = normalizeRelayBaseUrl(relayBaseUrl)

    val connectorUrl: String
        get() = "$normalizedRelayBaseUrl/mcp/${credentials.channelId}?access_token=${credentials.connectorToken}"
}

enum class RemoteBridgePhase { OFF, CONNECTING, CONNECTED, RECONNECTING, EXPIRED, ERROR }

data class RemoteBridgeState(
    val phase: RemoteBridgePhase,
    val message: String,
)

fun normalizeRelayBaseUrl(value: String): String {
    val trimmed = value.trim().trimEnd('/')
    val uri = runCatching { URI(trimmed) }.getOrElse { throw IllegalArgumentException("Relay URL is invalid") }
    require(uri.scheme == "https") { "Relay URL must use HTTPS" }
    require(!uri.host.isNullOrBlank()) { "Relay URL must include a host" }
    require(uri.userInfo == null && uri.query == null && uri.fragment == null) { "Relay URL cannot contain credentials, a query, or a fragment" }
    require(uri.path.isNullOrEmpty() || uri.path == "/") { "Relay URL must not include a path" }
    return trimmed
}
