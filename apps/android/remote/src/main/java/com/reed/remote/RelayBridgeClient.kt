package com.reed.remote

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.delay
import kotlinx.coroutines.isActive
import kotlinx.serialization.Serializable
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import java.io.IOException
import java.net.HttpURLConnection
import java.net.URL

class RelayBridgeClient(
    private val json: Json = Json { ignoreUnknownKeys = false; encodeDefaults = true },
    private val now: () -> Long = System::currentTimeMillis,
) {
    suspend fun run(
        configuration: RemoteAccessConfiguration,
        onState: (RemoteBridgeState) -> Unit,
        dispatch: (JsonElement) -> JsonElement?,
        onRequestCompleted: () -> Unit,
    ) {
        var backoffMs = 1_000L
        try {
            while (currentCoroutineContext().isActive && now() < configuration.expiresAtEpochMs) {
                try {
                    onState(RemoteBridgeState(RemoteBridgePhase.CONNECTING, "Connecting securely to relay"))
                    connect(configuration)
                    onState(RemoteBridgeState(RemoteBridgePhase.CONNECTED, "Claude can access ${configuration.projectName}"))
                    backoffMs = 1_000L
                    while (currentCoroutineContext().isActive && now() < configuration.expiresAtEpochMs) {
                        val envelope = poll(configuration) ?: continue
                        val response = dispatch(envelope.request)
                        respond(configuration, envelope.requestId, response)
                        onRequestCompleted()
                    }
                } catch (cancelled: CancellationException) {
                    throw cancelled
                } catch (error: Exception) {
                    onState(RemoteBridgeState(RemoteBridgePhase.RECONNECTING, safeMessage(error)))
                    delay(backoffMs)
                    backoffMs = (backoffMs * 2).coerceAtMost(15_000L)
                }
            }
            if (now() >= configuration.expiresAtEpochMs) {
                onState(RemoteBridgeState(RemoteBridgePhase.EXPIRED, "Agent Access session expired"))
            }
        } finally {
            runCatching { disconnect(configuration) }
        }
    }

    private fun connect(configuration: RemoteAccessConfiguration) {
        val body = ConnectRequest(
            channelId = configuration.credentials.channelId,
            connectorToken = configuration.credentials.connectorToken,
            projectName = configuration.projectName,
            expiresAt = configuration.expiresAtEpochMs,
        )
        post(configuration, "/bridge/v1/connect", json.encodeToString(body), 10_000)
    }

    private fun poll(configuration: RemoteAccessConfiguration): RelayEnvelope? {
        val result = post(
            configuration,
            "/bridge/v1/poll",
            json.encodeToString(ChannelRequest(configuration.credentials.channelId)),
            30_000,
            acceptedStatuses = setOf(200, 204),
        )
        return if (result.status == 204) null else json.decodeFromString<RelayEnvelope>(result.body)
    }

    private fun respond(configuration: RemoteAccessConfiguration, requestId: String, response: JsonElement?) {
        post(
            configuration,
            "/bridge/v1/respond",
            json.encodeToString(ResponseRequest(configuration.credentials.channelId, requestId, response)),
            10_000,
        )
    }

    private fun disconnect(configuration: RemoteAccessConfiguration) {
        post(
            configuration,
            "/bridge/v1/disconnect",
            json.encodeToString(ChannelRequest(configuration.credentials.channelId)),
            5_000,
            acceptedStatuses = setOf(200, 404),
        )
    }

    private fun post(
        configuration: RemoteAccessConfiguration,
        path: String,
        body: String,
        readTimeoutMs: Int,
        acceptedStatuses: Set<Int> = setOf(200),
    ): HttpResult {
        val connection = URL(configuration.normalizedRelayBaseUrl + path).openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = "POST"
            connection.connectTimeout = 10_000
            connection.readTimeout = readTimeoutMs
            connection.doOutput = true
            connection.instanceFollowRedirects = false
            connection.setRequestProperty("Authorization", "Bearer ${configuration.credentials.deviceToken}")
            connection.setRequestProperty("Content-Type", "application/json; charset=utf-8")
            connection.setRequestProperty("Accept", "application/json")
            connection.outputStream.use { it.write(body.toByteArray(Charsets.UTF_8)) }
            val status = connection.responseCode
            val stream = if (status in 200..299) connection.inputStream else connection.errorStream
            val responseBody = stream?.bufferedReader(Charsets.UTF_8)?.use { it.readText() }.orEmpty()
            if (status !in acceptedStatuses) {
                val relayError = runCatching { json.decodeFromString<RelayError>(responseBody).error }.getOrNull()
                throw IOException(relayError ?: "Relay returned HTTP $status")
            }
            HttpResult(status, responseBody)
        } finally {
            connection.disconnect()
        }
    }

    private fun safeMessage(error: Exception): String = when (error) {
        is IOException -> error.message?.take(180) ?: "Relay unavailable; retrying"
        else -> "Relay unavailable; retrying"
    }
}

private data class HttpResult(val status: Int, val body: String)

@Serializable
private data class ConnectRequest(
    val channelId: String,
    val connectorToken: String,
    val projectName: String,
    val expiresAt: Long,
)

@Serializable
private data class ChannelRequest(val channelId: String)

@Serializable
private data class ResponseRequest(val channelId: String, val requestId: String, val response: JsonElement?)

@Serializable
private data class RelayEnvelope(val requestId: String, val request: JsonElement)

@Serializable
private data class RelayError(val error: String)
