package com.reed.editor.agent

import android.annotation.SuppressLint
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.os.IBinder
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat
import com.reed.editor.MainActivity
import com.reed.editor.R
import com.reed.editor.ReedApplication
import com.reed.remote.RelayBridgeClient
import com.reed.remote.RemoteAccessConfiguration
import com.reed.remote.RemoteAccessCredentials
import com.reed.remote.RemoteBridgePhase
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

class RemoteAgentService : Service() {
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private var sessionJob: Job? = null
    private var projectId: String? = null

    override fun onCreate() {
        super.onCreate()
        createNotificationChannel()
    }

    @SuppressLint("InlinedApi") // ServiceCompat ignores the inlined type on the API 33 DC-1.
    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
        if (intent?.action == ACTION_STOP) {
            stopSession("Disconnected by you")
            return START_NOT_STICKY
        }
        val configuration = intent?.toConfiguration() ?: run {
            stopSession("Agent Access could not start")
            return START_NOT_STICKY
        }
        projectId = configuration.projectId
        ServiceCompat.startForeground(
            this,
            NOTIFICATION_ID,
            notification(configuration.projectName, "Connecting…"),
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE,
        )
        sessionJob?.cancel()
        val app = application as ReedApplication
        val dispatcher = AndroidMcpDispatcher(app.core, configuration.projectId) {
            RemoteAgentAccessRuntime.markRequest(configuration.projectId)
        }
        sessionJob = scope.launch {
            RelayBridgeClient().run(
                configuration = configuration,
                onState = { bridgeState ->
                    val previous = RemoteAgentAccessRuntime.status.value
                    RemoteAgentAccessRuntime.update(
                        AgentAccessStatus(
                            phase = bridgeState.phase,
                            projectId = configuration.projectId,
                            projectName = configuration.projectName,
                            connectorUrl = configuration.connectorUrl,
                            expiresAtEpochMs = configuration.expiresAtEpochMs,
                            lastRequestAtEpochMs = previous.lastRequestAtEpochMs,
                            message = bridgeState.message,
                        ),
                    )
                    notifyStatus(configuration.projectName, bridgeState.message)
                },
                dispatch = dispatcher::dispatch,
                onRequestCompleted = {},
            )
            if (RemoteAgentAccessRuntime.status.value.phase == RemoteBridgePhase.EXPIRED) {
                stopForeground(STOP_FOREGROUND_REMOVE)
                stopSelf()
            }
        }
        return START_NOT_STICKY
    }

    override fun onDestroy() {
        sessionJob?.cancel()
        scope.cancel()
        if (RemoteAgentAccessRuntime.status.value.phase != RemoteBridgePhase.EXPIRED) {
            RemoteAgentAccessRuntime.turnOff()
        }
        super.onDestroy()
    }

    override fun onBind(intent: Intent?): IBinder? = null

    private fun stopSession(message: String) {
        sessionJob?.cancel()
        RemoteAgentAccessRuntime.turnOff(message)
        stopForeground(STOP_FOREGROUND_REMOVE)
        stopSelf()
    }

    private fun createNotificationChannel() {
        val manager = getSystemService(NotificationManager::class.java)
        manager.createNotificationChannel(
            NotificationChannel(CHANNEL_ID, "Remote Agent Access", NotificationManager.IMPORTANCE_LOW).apply {
                description = "Shows when an external AI agent can access a local Reed project"
                setShowBadge(false)
            },
        )
    }

    private fun notification(projectName: String, status: String) = NotificationCompat.Builder(this, CHANNEL_ID)
        .setSmallIcon(R.drawable.ic_agent_access)
        .setContentTitle("Claude access active · $projectName")
        .setContentText(status)
        .setOngoing(true)
        .setOnlyAlertOnce(true)
        .setCategory(NotificationCompat.CATEGORY_SERVICE)
        .setContentIntent(
            PendingIntent.getActivity(
                this, 0, Intent(this, MainActivity::class.java),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ),
        )
        .addAction(
            0,
            "Disconnect",
            PendingIntent.getService(
                this, 1, Intent(this, RemoteAgentService::class.java).setAction(ACTION_STOP),
                PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
            ),
        )
        .build()

    private fun notifyStatus(projectName: String, status: String) {
        getSystemService(NotificationManager::class.java).notify(NOTIFICATION_ID, notification(projectName, status))
    }

    private fun Intent.toConfiguration(): RemoteAccessConfiguration? = runCatching {
        RemoteAccessConfiguration(
            relayBaseUrl = requireNotNull(getStringExtra(EXTRA_RELAY_URL)),
            projectId = requireNotNull(getStringExtra(EXTRA_PROJECT_ID)),
            projectName = requireNotNull(getStringExtra(EXTRA_PROJECT_NAME)),
            credentials = RemoteAccessCredentials(
                channelId = requireNotNull(getStringExtra(EXTRA_CHANNEL_ID)),
                deviceToken = requireNotNull(getStringExtra(EXTRA_DEVICE_TOKEN)),
                connectorToken = requireNotNull(getStringExtra(EXTRA_CONNECTOR_TOKEN)),
            ),
            expiresAtEpochMs = getLongExtra(EXTRA_EXPIRES_AT, 0L),
        )
    }.getOrNull()

    companion object {
        const val ACTION_STOP = "com.reed.editor.agent.STOP"
        private const val CHANNEL_ID = "reed-agent-access"
        private const val NOTIFICATION_ID = 3301
        private const val EXTRA_RELAY_URL = "relayUrl"
        private const val EXTRA_PROJECT_ID = "projectId"
        private const val EXTRA_PROJECT_NAME = "projectName"
        private const val EXTRA_CHANNEL_ID = "channelId"
        private const val EXTRA_DEVICE_TOKEN = "deviceToken"
        private const val EXTRA_CONNECTOR_TOKEN = "connectorToken"
        private const val EXTRA_EXPIRES_AT = "expiresAt"

        fun startIntent(context: Context, configuration: RemoteAccessConfiguration) =
            Intent(context, RemoteAgentService::class.java).apply {
                putExtra(EXTRA_RELAY_URL, configuration.normalizedRelayBaseUrl)
                putExtra(EXTRA_PROJECT_ID, configuration.projectId)
                putExtra(EXTRA_PROJECT_NAME, configuration.projectName)
                putExtra(EXTRA_CHANNEL_ID, configuration.credentials.channelId)
                putExtra(EXTRA_DEVICE_TOKEN, configuration.credentials.deviceToken)
                putExtra(EXTRA_CONNECTOR_TOKEN, configuration.credentials.connectorToken)
                putExtra(EXTRA_EXPIRES_AT, configuration.expiresAtEpochMs)
            }
    }
}
