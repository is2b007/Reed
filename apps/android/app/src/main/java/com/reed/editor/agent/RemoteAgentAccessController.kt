package com.reed.editor.agent

import android.content.Context
import android.content.Intent
import androidx.core.content.ContextCompat
import com.reed.remote.RemoteAccessConfiguration
import com.reed.remote.RemoteBridgePhase
import com.reed.remote.SecureRemoteAccessStore
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.StateFlow
import java.time.Instant

data class AgentAccessStatus(
    val phase: RemoteBridgePhase = RemoteBridgePhase.OFF,
    val projectId: String? = null,
    val projectName: String? = null,
    val connectorUrl: String? = null,
    val expiresAtEpochMs: Long? = null,
    val lastRequestAtEpochMs: Long? = null,
    val message: String = "Remote Agent Access is off",
) {
    val active: Boolean
        get() = phase in setOf(RemoteBridgePhase.CONNECTING, RemoteBridgePhase.CONNECTED, RemoteBridgePhase.RECONNECTING)
}

object RemoteAgentAccessRuntime {
    private val mutableStatus = MutableStateFlow(AgentAccessStatus())
    private val mutableProjectChanges = MutableSharedFlow<String>(extraBufferCapacity = 16)
    val status: StateFlow<AgentAccessStatus> = mutableStatus
    val projectChanges: SharedFlow<String> = mutableProjectChanges

    fun update(value: AgentAccessStatus) { mutableStatus.value = value }

    fun markRequest(projectId: String) {
        mutableStatus.value = mutableStatus.value.copy(lastRequestAtEpochMs = System.currentTimeMillis())
        mutableProjectChanges.tryEmit(projectId)
    }

    fun turnOff(message: String = "Remote Agent Access is off") {
        mutableStatus.value = AgentAccessStatus(message = message)
    }
}

class RemoteAgentAccessController(context: Context) {
    private val applicationContext = context.applicationContext
    private val credentials = SecureRemoteAccessStore(applicationContext)
    val status: StateFlow<AgentAccessStatus> = RemoteAgentAccessRuntime.status
    val projectChanges: SharedFlow<String> = RemoteAgentAccessRuntime.projectChanges

    fun start(projectId: String, projectName: String, relayBaseUrl: String, durationHours: Int = 8): RemoteAccessConfiguration {
        require(durationHours in 1..24) { "Agent Access duration must be between 1 and 24 hours" }
        val configuration = RemoteAccessConfiguration(
            relayBaseUrl = relayBaseUrl,
            projectId = projectId,
            projectName = projectName,
            credentials = credentials.loadOrCreate(projectId),
            expiresAtEpochMs = Instant.now().plusSeconds(durationHours * 3_600L).toEpochMilli(),
        )
        RemoteAgentAccessRuntime.update(
            AgentAccessStatus(
                phase = RemoteBridgePhase.CONNECTING,
                projectId = projectId,
                projectName = projectName,
                connectorUrl = configuration.connectorUrl,
                expiresAtEpochMs = configuration.expiresAtEpochMs,
                message = "Starting secure Agent Access",
            ),
        )
        ContextCompat.startForegroundService(applicationContext, RemoteAgentService.startIntent(applicationContext, configuration))
        return configuration
    }

    fun stop() {
        applicationContext.startService(Intent(applicationContext, RemoteAgentService::class.java).setAction(RemoteAgentService.ACTION_STOP))
    }

    fun rotateConnector(projectId: String) {
        stop()
        credentials.reset(projectId)
        RemoteAgentAccessRuntime.turnOff("Connector capability rotated. Start Agent Access to copy the new URL.")
    }
}
