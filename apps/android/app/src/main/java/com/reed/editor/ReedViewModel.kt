package com.reed.editor

import android.app.Application
import androidx.core.content.edit
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.reed.core.ConversationGraph
import com.reed.core.DialogueNodeRecord
import com.reed.core.NodeKind
import com.reed.core.ProjectOverview
import com.reed.core.ProjectRecord
import com.reed.core.ProjectSummary
import com.reed.core.TextStatus
import com.reed.git.GitIdentity
import com.reed.git.RepositoryStatus
import com.reed.editor.agent.AgentAccessStatus
import com.reed.remote.RemoteBridgePhase
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.json.JsonPrimitive
import java.io.File
import java.security.MessageDigest

enum class Workspace { GRAPH, CHARACTERS, VARIABLES, TRANSLATION, GIT, AGENT }

data class RepositoryConnection(
    val directory: File,
    val url: String,
    val identity: GitIdentity,
)

data class ReedUiState(
    val projects: List<ProjectSummary> = emptyList(),
    val activeProject: ProjectRecord? = null,
    val overview: ProjectOverview? = null,
    val graph: ConversationGraph? = null,
    val selectedNodeId: String? = null,
    val selectedNodeIds: Set<String> = emptySet(),
    val selectedLanguage: String = "en",
    val workspace: Workspace = Workspace.GRAPH,
    val repository: RepositoryConnection? = null,
    val repositoryStatus: RepositoryStatus? = null,
    val repositoryTokenConfigured: Boolean = false,
    val busyLabel: String? = null,
    val saved: Boolean = true,
    val notice: String? = null,
    val error: String? = null,
    val commandPaletteOpen: Boolean = false,
    val linkOriginNodeId: String? = null,
    val agentAccess: AgentAccessStatus = AgentAccessStatus(),
    val agentRelayUrl: String = "",
) {
    val selectedNode: DialogueNodeRecord?
        get() = graph?.nodes?.firstOrNull { it.id == selectedNodeId }

    val usesBuiltInAgentRelay: Boolean
        get() = BuildConfig.DEFAULT_AGENT_RELAY_URL.isNotBlank() &&
            agentRelayUrl == BuildConfig.DEFAULT_AGENT_RELAY_URL
}

class ReedViewModel(application: Application) : AndroidViewModel(application) {
    private val app = application as ReedApplication
    private val core = app.core
    private val git = app.git
    private val preferences = application.getSharedPreferences("reed.android", 0)
    private val mutableState = MutableStateFlow(ReedUiState())
    val state: StateFlow<ReedUiState> = mutableState.asStateFlow()

    init {
        refreshProjects(openLast = true)
        val configuredRelayUrl = preferences.getString("remote.relayUrl", null)
            ?.takeIf(String::isNotBlank)
            ?: BuildConfig.DEFAULT_AGENT_RELAY_URL
        mutableState.update { it.copy(agentRelayUrl = configuredRelayUrl) }
        viewModelScope.launch {
            app.agentAccess.status.collect { status -> mutableState.update { it.copy(agentAccess = status) } }
        }
        viewModelScope.launch {
            app.agentAccess.projectChanges.collect { changedProjectId ->
                if (state.value.activeProject?.id == changedProjectId) reloadActive("Updated by Claude")
            }
        }
    }

    fun createProject(name: String, slug: String, languages: List<String>, defaultLanguage: String) = io("Creating project") {
        val snapshot = core.createProject(name, slug, languages, defaultLanguage)
        withContext(Dispatchers.Main) { openProject(snapshot.project.id) }
    }

    fun openProject(projectId: String) {
        viewModelScope.launch(Dispatchers.IO) {
            runCatching {
                val overview = core.projectOverview(projectId)
                val conversation = overview.conversations.firstOrNull()
                val graph = conversation?.let { core.conversationGraph(it.id) }
                val repository = loadConnection(projectId)
                val repositoryStatus = repository?.let { runCatching { git.status(it.directory) }.getOrNull() }
                val repositoryTokenConfigured = repository?.let { app.tokens.load(it.url) != null } == true
                val initialNodeId = graph?.nodes?.firstOrNull { node -> node.kind != NodeKind.START }?.id
                    ?: graph?.nodes?.firstOrNull()?.id
                preferences.edit { putString("lastProject", projectId) }
                mutableState.update {
                    it.copy(
                        activeProject = overview.project,
                        overview = overview,
                        graph = graph,
                        selectedNodeId = initialNodeId,
                        selectedNodeIds = initialNodeId?.let(::setOf).orEmpty(),
                        selectedLanguage = overview.project.defaultLanguage,
                        repository = repository,
                        repositoryStatus = repositoryStatus,
                        repositoryTokenConfigured = repositoryTokenConfigured,
                        workspace = Workspace.GRAPH,
                        notice = null,
                        error = null,
                    )
                }
            }.onFailure(::reportError)
        }
    }

    fun closeProject() {
        mutableState.update {
            it.copy(
                activeProject = null, overview = null, graph = null, selectedNodeId = null,
                selectedNodeIds = emptySet(),
                repository = null, repositoryStatus = null, repositoryTokenConfigured = false,
                notice = null, error = null
            )
        }
        refreshProjects(openLast = false)
    }

    fun selectConversation(id: String) = viewModelScope.launch(Dispatchers.IO) {
        runCatching { core.conversationGraph(id) }
            .onSuccess { graph ->
                val initialNodeId = graph.nodes.firstOrNull { node -> node.kind != NodeKind.START }?.id
                    ?: graph.nodes.firstOrNull()?.id
                mutableState.update {
                    it.copy(
                        graph = graph,
                        selectedNodeId = initialNodeId,
                        selectedNodeIds = initialNodeId?.let(::setOf).orEmpty(),
                        error = null,
                    )
                }
            }
            .onFailure(::reportError)
    }

    fun selectNode(id: String?) = mutableState.update {
        it.copy(selectedNodeId = id, selectedNodeIds = id?.let(::setOf).orEmpty())
    }

    fun selectNodes(ids: Set<String>) = mutableState.update { current ->
        val orderedIds = current.graph?.nodes?.map { it.id }?.filter { it in ids }.orEmpty()
        val primary = current.selectedNodeId?.takeIf { it in ids } ?: orderedIds.firstOrNull()
        current.copy(selectedNodeId = primary, selectedNodeIds = orderedIds.toSet(), linkOriginNodeId = null)
    }

    fun toggleNodeSelection(id: String) = mutableState.update { current ->
        val next = current.selectedNodeIds.toMutableSet().apply {
            if (!add(id)) remove(id)
        }
        val orderedIds = current.graph?.nodes?.map { it.id }?.filter { it in next }.orEmpty()
        current.copy(
            selectedNodeId = current.selectedNodeId?.takeIf { it in next } ?: orderedIds.firstOrNull(),
            selectedNodeIds = orderedIds.toSet(),
            linkOriginNodeId = null,
        )
    }

    fun nodeClicked(id: String) {
        val originId = state.value.linkOriginNodeId
        if (originId == null || originId == id) {
            mutableState.update { it.copy(selectedNodeId = id, selectedNodeIds = setOf(id), linkOriginNodeId = null) }
            return
        }
        connectNodes(originId, id)
    }

    fun connectNodes(originId: String, destinationId: String) {
        if (originId == destinationId) {
            mutableState.update { it.copy(selectedNodeId = originId, selectedNodeIds = setOf(originId), linkOriginNodeId = null) }
            return
        }
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        val origin = graph.nodes.firstOrNull { it.id == originId } ?: return
        val destination = graph.nodes.firstOrNull { it.id == destinationId } ?: return
        mutableState.update { it.copy(selectedNodeId = destinationId, selectedNodeIds = setOf(destinationId), linkOriginNodeId = null) }
        io("Creating link") {
            core.linkNodes(project.id, origin.lineId, destination.lineId, graph.version)
            reloadActive("Linked ${origin.lineId} to ${destination.lineId}", destinationId)
        }
    }

    fun beginLink(nodeId: String) = mutableState.update {
        it.copy(selectedNodeId = nodeId, selectedNodeIds = setOf(nodeId), linkOriginNodeId = nodeId, notice = "Select a destination node")
    }

    fun cancelLink() = mutableState.update { it.copy(linkOriginNodeId = null, notice = null) }

    fun unlink(linkId: String) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        io("Removing link") {
            core.unlinkNodes(project.id, linkId, graph.version)
            reloadActive("Link removed")
        }
    }

    fun selectLanguage(language: String) = mutableState.update { it.copy(selectedLanguage = language) }

    fun setWorkspace(workspace: Workspace) = mutableState.update { it.copy(workspace = workspace) }

    fun updateAgentRelayUrl(value: String) = mutableState.update { it.copy(agentRelayUrl = value) }

    fun startAgentAccess() {
        val project = state.value.activeProject ?: return
        val relayUrl = state.value.agentRelayUrl.trim()
        runCatching {
            preferences.edit { putString("remote.relayUrl", relayUrl) }
            app.agentAccess.start(project.id, project.name, relayUrl)
        }.onFailure(::reportError)
    }

    fun stopAgentAccess() = app.agentAccess.stop()

    fun rotateAgentConnector() {
        val project = state.value.activeProject ?: return
        app.agentAccess.rotateConnector(project.id)
    }

    fun refreshAfterAgentChanges() {
        val projectId = state.value.activeProject?.id ?: return
        if (state.value.agentAccess.projectId != projectId || state.value.agentAccess.phase == RemoteBridgePhase.OFF) return
        viewModelScope.launch(Dispatchers.IO) { runCatching { reloadActive(null) }.onFailure(::reportError) }
    }

    fun saveNodeText(lineId: String, language: String, text: String, menuText: String?) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        mutableState.update { it.copy(saved = false) }
        io("Saving") {
            core.setNodeText(project.id, lineId, language, text, menuText, graph.version)
            reloadActive("Saved locally")
        }
    }

    fun setLineStatus(lineId: String, status: TextStatus) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        io("Saving") {
            core.setLineStatus(project.id, lineId, status, graph.version)
            reloadActive("Saved locally")
        }
    }

    fun moveNode(lineId: String, x: Double, y: Double) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        io(null) {
            core.updateNodePosition(project.id, lineId, x, y, graph.version)
            reloadActive(null)
        }
    }

    fun previewNodePosition(nodeId: String, x: Double, y: Double) {
        mutableState.update { current ->
            current.copy(graph = current.graph?.copy(nodes = current.graph.nodes.map {
                if (it.id == nodeId) it.copy(x = x, y = y) else it
            }))
        }
    }

    fun createNode(kind: NodeKind, x: Double, y: Double) {
        val project = state.value.activeProject ?: return
        val conversation = state.value.graph ?: return
        io("Adding ${kind.name.lowercase()}") {
            val result = core.createNode(project.id, conversation.id, kind, x, y, conversation.version)
            reloadActive("${kind.name.lowercase().replaceFirstChar(Char::uppercase)} added", result.value.id)
        }
    }

    fun createConnectedNode(originNodeId: String, kind: NodeKind, x: Double, y: Double) {
        val project = state.value.activeProject ?: return
        val conversation = state.value.graph ?: return
        val origin = conversation.nodes.firstOrNull { it.id == originNodeId } ?: return
        mutableState.update { it.copy(linkOriginNodeId = null) }
        io("Adding and linking ${kind.name.lowercase()}") {
            val created = core.createNode(project.id, conversation.id, kind, x, y, conversation.version)
            core.linkNodes(project.id, origin.lineId, created.value.lineId, created.version)
            reloadActive("${kind.name.lowercase().replaceFirstChar(Char::uppercase)} added and linked", created.value.id)
        }
    }

    fun deleteNode(lineId: String) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        io("Deleting line") {
            core.deleteNode(project.id, lineId, lineId, graph.version)
            reloadActive("$lineId deleted")
        }
    }

    fun setNodeSpeaker(lineId: String, characterId: String?) {
        val project = state.value.activeProject ?: return
        val graph = state.value.graph ?: return
        io("Saving speaker") {
            core.setNodeSpeaker(project.id, lineId, characterId, graph.version)
            reloadActive("Speaker saved")
        }
    }

    fun saveCharacter(
        id: String?,
        name: String,
        displayNames: Map<String, String>,
        isPlayer: Boolean,
        description: String,
        actorNotes: String,
        voiceNotes: String,
    ) {
        val project = state.value.activeProject ?: return
        io("Saving character") {
            core.upsertCharacter(
                project.id, id, name, displayNames, isPlayer, description, actorNotes, voiceNotes, project.version
            )
            reloadActive("Character saved")
        }
    }

    fun saveVariable(id: String?, name: String, type: String, initialValue: String, description: String) {
        val project = state.value.activeProject ?: return
        val parsed = when (type) {
            "boolean" -> JsonPrimitive(initialValue.equals("true", ignoreCase = true))
            "number" -> JsonPrimitive(initialValue.toDoubleOrNull() ?: 0.0)
            else -> JsonPrimitive(initialValue)
        }
        io("Saving variable") {
            core.upsertVariable(project.id, id, name, type, parsed, description, project.version)
            reloadActive("Variable saved")
        }
    }

    fun cloneRepository(url: String, token: String?, identity: GitIdentity) = io("Cloning repository") {
        val directory = File(getApplication<Application>().filesDir, "repositories/${stableName(url)}")
        val result = git.clone(url.trim(), directory, token?.trim()?.ifEmpty { null })
        val project = requireNotNull(result.importedProject).project
        if (!token.isNullOrBlank()) app.tokens.save(url.trim(), token.trim())
        saveConnection(project.id, RepositoryConnection(directory, url.trim(), identity))
        preferences.edit { putString("lastProject", project.id) }
        reloadProject(project.id, result.message)
    }

    fun connectRepository(url: String, token: String?, identity: GitIdentity) {
        val project = state.value.activeProject ?: return
        io("Connecting repository") {
            val directory = File(getApplication<Application>().filesDir, "repositories/${stableName(url + project.id)}")
            val status = git.initialize(directory, project.id, url.trim(), identity)
            if (!token.isNullOrBlank()) app.tokens.save(url.trim(), token.trim())
            val connection = RepositoryConnection(directory, url.trim(), identity)
            saveConnection(project.id, connection)
            mutableState.update {
                it.copy(
                    repository = connection,
                    repositoryStatus = status,
                    repositoryTokenConfigured = !token.isNullOrBlank(),
                    notice = "Local repository ready. Push when the remote is empty.",
                )
            }
        }
    }

    fun updateRepositoryToken(token: String) {
        val repository = state.value.repository ?: return
        io("Updating repository access") {
            app.tokens.save(repository.url, token.trim())
            mutableState.update {
                it.copy(
                    repositoryTokenConfigured = true,
                    notice = "Repository access token updated. Reed will use it only for requested Git actions.",
                )
            }
        }
    }

    fun clearRepositoryToken() {
        val repository = state.value.repository ?: return
        app.tokens.clear(repository.url)
        mutableState.update {
            it.copy(
                repositoryTokenConfigured = false,
                notice = "Saved repository token removed. Public repositories remain available.",
            )
        }
    }

    fun checkpoint(message: String) {
        val project = state.value.activeProject ?: return
        val repository = state.value.repository ?: return
        io("Creating checkpoint") {
            val status = git.checkpoint(repository.directory, project.id, message, repository.identity)
            mutableState.update { it.copy(repositoryStatus = status, notice = "Checkpoint created", saved = true) }
        }
    }

    fun fetch() = repositoryAction("Fetching") { repository, token ->
        val status = git.fetch(repository.directory, token)
        mutableState.update { it.copy(repositoryStatus = status, notice = "Fetched remote status") }
    }

    fun pull() = repositoryAction("Pulling") { repository, token ->
        val result = git.pullFastForward(repository.directory, token)
        val projectId = result.importedProject?.project?.id ?: state.value.activeProject?.id
        if (projectId != null && result.importedProject != null) reloadProject(projectId, result.message)
        else mutableState.update { it.copy(repositoryStatus = result.status, notice = result.message) }
    }

    fun push() = repositoryAction("Pushing") { repository, token ->
        val result = git.push(repository.directory, token)
        mutableState.update { it.copy(repositoryStatus = result.status, notice = result.message) }
    }

    fun sync() = repositoryAction("Syncing") { repository, token ->
        val result = git.sync(repository.directory, token)
        val projectId = result.importedProject?.project?.id ?: state.value.activeProject?.id
        if (projectId != null && result.importedProject != null) reloadProject(projectId, result.message)
        else mutableState.update { it.copy(repositoryStatus = result.status, notice = result.message) }
    }

    fun clearNotice() = mutableState.update { it.copy(notice = null, error = null) }
    fun toggleCommandPalette(open: Boolean = !state.value.commandPaletteOpen) =
        mutableState.update { it.copy(commandPaletteOpen = open) }

    private fun refreshProjects(openLast: Boolean) = viewModelScope.launch(Dispatchers.IO) {
        val projects = core.listProjects()
        mutableState.update { it.copy(projects = projects) }
        if (openLast) {
            val last = preferences.getString("lastProject", null)
            val project = projects.firstOrNull { it.id == last } ?: projects.firstOrNull()
            if (project != null) withContext(Dispatchers.Main) { openProject(project.id) }
        }
    }

    private suspend fun reloadActive(notice: String?, selectedNodeId: String? = state.value.selectedNodeId) {
        val projectId = state.value.activeProject?.id ?: return
        val conversationId = state.value.graph?.id
        val overview = core.projectOverview(projectId)
        val graph = conversationId?.let { core.conversationGraph(it) }
        val previous = state.value
        val retainedPrimary = selectedNodeId?.takeIf { id -> graph?.nodes?.any { node -> node.id == id } == true }
        val retainedSelection: Set<String> = if (selectedNodeId != previous.selectedNodeId) {
            retainedPrimary?.let(::setOf).orEmpty()
        } else {
            val filtered = previous.selectedNodeIds.filterTo(linkedSetOf()) { id ->
                graph?.nodes?.any { node -> node.id == id } == true
            }
            if (filtered.isEmpty()) retainedPrimary?.let(::setOf).orEmpty() else filtered
        }
        mutableState.update {
            it.copy(
                projects = core.listProjects(), activeProject = overview.project, overview = overview, graph = graph,
                selectedNodeId = retainedPrimary,
                selectedNodeIds = retainedSelection,
                saved = true, busyLabel = null, notice = notice, error = null, linkOriginNodeId = null
            )
        }
    }

    private suspend fun reloadProject(projectId: String, notice: String?) {
        val overview = core.projectOverview(projectId)
        val graph = overview.conversations.firstOrNull()?.let { core.conversationGraph(it.id) }
        val initialNodeId = graph?.nodes?.firstOrNull { node -> node.kind != NodeKind.START }?.id
        val connection = loadConnection(projectId)
        val status = connection?.let { runCatching { git.status(it.directory) }.getOrNull() }
        val repositoryTokenConfigured = connection?.let { app.tokens.load(it.url) != null } == true
        mutableState.update {
            it.copy(
                projects = core.listProjects(), activeProject = overview.project, overview = overview, graph = graph,
                selectedNodeId = initialNodeId,
                selectedNodeIds = initialNodeId?.let(::setOf).orEmpty(),
                selectedLanguage = overview.project.defaultLanguage, repository = connection, repositoryStatus = status,
                repositoryTokenConfigured = repositoryTokenConfigured,
                saved = true, busyLabel = null, notice = notice, error = null
            )
        }
    }

    private fun repositoryAction(
        label: String,
        action: suspend (RepositoryConnection, String?) -> Unit,
    ) {
        val repository = state.value.repository ?: return
        io(label) { action(repository, app.tokens.load(repository.url)) }
    }

    private fun io(label: String?, block: suspend () -> Unit) {
        viewModelScope.launch(Dispatchers.IO) {
            if (label != null) mutableState.update { it.copy(busyLabel = label, error = null) }
            runCatching { block() }
                .onFailure(::reportError)
            mutableState.update { it.copy(busyLabel = null) }
        }
    }

    private fun reportError(error: Throwable) {
        mutableState.update { it.copy(error = error.message ?: error::class.simpleName, busyLabel = null, saved = true) }
    }

    private fun saveConnection(projectId: String, connection: RepositoryConnection) {
        preferences.edit {
            putString("repo.$projectId.directory", connection.directory.absolutePath)
            putString("repo.$projectId.url", connection.url)
            putString("repo.$projectId.name", connection.identity.name)
            putString("repo.$projectId.email", connection.identity.email)
        }
    }

    private fun loadConnection(projectId: String): RepositoryConnection? {
        val directory = preferences.getString("repo.$projectId.directory", null) ?: return null
        val url = preferences.getString("repo.$projectId.url", null) ?: return null
        val name = preferences.getString("repo.$projectId.name", "Reed Android") ?: "Reed Android"
        val email = preferences.getString("repo.$projectId.email", "reed@localhost") ?: "reed@localhost"
        return RepositoryConnection(File(directory), url, GitIdentity(name, email)).takeIf { it.directory.isDirectory }
    }

    private fun stableName(value: String): String {
        val hash = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
        return hash.take(12).joinToString("") { "%02x".format(it) }
    }
}
