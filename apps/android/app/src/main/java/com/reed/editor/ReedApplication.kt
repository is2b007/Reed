package com.reed.editor

import android.app.Application
import com.reed.core.ReedCore
import com.reed.git.GitRepositoryService
import com.reed.git.SecureTokenStore
import com.reed.editor.agent.RemoteAgentAccessController

class ReedApplication : Application() {
    val core by lazy { ReedCore(this) }
    val git by lazy { GitRepositoryService(core) }
    val tokens by lazy { SecureTokenStore(this) }
    val agentAccess by lazy { RemoteAgentAccessController(this) }
}
