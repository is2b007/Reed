package com.reed.git

import com.reed.core.ProjectSnapshot
import com.reed.core.ReedCore
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.api.MergeCommand
import org.eclipse.jgit.lib.Constants
import org.eclipse.jgit.lib.ObjectId
import org.eclipse.jgit.lib.Repository
import org.eclipse.jgit.revwalk.RevWalk
import org.eclipse.jgit.storage.file.FileRepositoryBuilder
import org.eclipse.jgit.transport.UsernamePasswordCredentialsProvider
import org.eclipse.jgit.treewalk.TreeWalk
import java.io.File

data class GitIdentity(val name: String, val email: String)

data class RepositoryStatus(
    val branch: String,
    val remoteUrl: String?,
    val head: String?,
    val hasWorkingChanges: Boolean,
    val ahead: Int,
    val behind: Int,
)

enum class SyncDisposition { CLONED, PULLED, PUSHED, CURRENT, DIVERGED, WORKTREE_DIRTY }

data class SyncResult(
    val disposition: SyncDisposition,
    val status: RepositoryStatus,
    val importedProject: ProjectSnapshot? = null,
    val message: String,
)

/**
 * The only outbound-network boundary in Reed Android.
 * Every network method is named for and called from a direct user action.
 */
class GitRepositoryService private constructor(
    private val core: ReedCore,
    private val acceptsRemoteUrl: (String) -> Boolean,
) {
    constructor(core: ReedCore) : this(core, { url -> url.startsWith("https://") })

    internal constructor(core: ReedCore, allowLocalFileRemotes: Boolean) : this(
        core,
        { url -> url.startsWith("https://") || (allowLocalFileRemotes && url.startsWith("file:")) },
    )

    suspend fun clone(
        url: String,
        directory: File,
        token: String?,
        branch: String? = null,
    ): SyncResult = withContext(Dispatchers.IO) {
        require(acceptsRemoteUrl(url)) { "Use an HTTPS Git URL" }
        require(!directory.exists() || directory.listFiles().isNullOrEmpty()) { "Clone destination is not empty" }
        directory.parentFile?.mkdirs()
        if (directory.exists()) check(directory.delete()) { "Unable to prepare clone destination" }
        val staging = File(directory.parentFile, ".${directory.name}.clone")
        if (staging.exists()) staging.deleteRecursively()
        try {
            val command = Git.cloneRepository().setURI(url).setDirectory(staging)
            if (!branch.isNullOrBlank()) command.setBranch(branch)
            credentials(token)?.let(command::setCredentialsProvider)
            command.call().use {
                val export = File(staging, EXPORT_PATH)
                require(export.isFile) { "Repository does not contain $EXPORT_PATH" }
            }
            check(staging.renameTo(directory)) { "Unable to finalize the cloned repository" }
            val snapshot = try {
                core.importProjectFile(File(directory, EXPORT_PATH), "system")
            } catch (error: Exception) {
                directory.deleteRecursively()
                throw error
            }
            open(directory).use { git ->
                SyncResult(SyncDisposition.CLONED, status(git.repository), snapshot, "Cloned ${snapshot.project.name}")
            }
        } finally {
            if (staging.exists()) staging.deleteRecursively()
        }
    }

    suspend fun checkpoint(
        directory: File,
        projectId: String,
        message: String,
        identity: GitIdentity,
    ): RepositoryStatus = withContext(Dispatchers.IO) {
        require(message.isNotBlank()) { "Checkpoint message is required" }
        open(directory).use { git ->
            core.exportProject(directory, projectId)
            git.add().addFilepattern(EXPORT_PATH).call()
            val changed = git.status().call().run {
                added.isNotEmpty() || changed.isNotEmpty() || modified.isNotEmpty() || removed.isNotEmpty() ||
                    missing.isNotEmpty() || untracked.contains(EXPORT_PATH)
            }
            if (changed) {
                git.commit()
                    .setMessage(message.trim())
                    .setAuthor(identity.name, identity.email)
                    .setCommitter(identity.name, identity.email)
                    .call()
            }
            status(git.repository)
        }
    }

    suspend fun initialize(
        directory: File,
        projectId: String,
        remoteUrl: String,
        identity: GitIdentity,
    ): RepositoryStatus = withContext(Dispatchers.IO) {
        require(acceptsRemoteUrl(remoteUrl)) { "Use an HTTPS Git URL" }
        require(!directory.exists() || directory.listFiles().isNullOrEmpty()) { "Repository directory is not empty" }
        directory.mkdirs()
        Git.init().setInitialBranch("main").setDirectory(directory).call().use { git ->
            git.repository.config.apply {
                setString("remote", "origin", "url", remoteUrl)
                setString("remote", "origin", "fetch", DEFAULT_FETCH_REFSPEC)
                save()
            }
            core.exportProject(directory, projectId)
            git.add().addFilepattern(EXPORT_PATH).call()
            git.commit()
                .setMessage("Initialize Reed project")
                .setAuthor(identity.name, identity.email)
                .setCommitter(identity.name, identity.email)
                .call()
            status(git.repository)
        }
    }

    suspend fun fetch(directory: File, token: String?): RepositoryStatus = withContext(Dispatchers.IO) {
        open(directory).use { git ->
            ensureFetchRefSpec(git.repository)
            val command = git.fetch().setRemote("origin").setRemoveDeletedRefs(true)
            credentials(token)?.let(command::setCredentialsProvider)
            command.call()
            status(git.repository)
        }
    }

    suspend fun pullFastForward(
        directory: File,
        token: String?,
    ): SyncResult = withContext(Dispatchers.IO) {
        open(directory).use { git ->
            require(liveProjectCheckpointed(directory)) { UNCHECKPOINTED_EDITS }
            requireClean(git)
            fetchInternal(git, token)
            val before = status(git.repository)
            if (before.ahead > 0 && before.behind > 0) {
                return@withContext SyncResult(SyncDisposition.DIVERGED, before, message = "Local and remote histories diverged")
            }
            if (before.behind == 0) {
                return@withContext SyncResult(SyncDisposition.CURRENT, before, message = "Already up to date")
            }
            val remote = remoteBranch(git.repository)
                ?: error("Remote branch is not available after fetch")
            validateRemoteExport(git.repository, remote)
            val result = git.merge()
                .include(remote)
                .setFastForward(MergeCommand.FastForwardMode.FF_ONLY)
                .call()
            check(result.mergeStatus.isSuccessful) { "Fast-forward pull failed: ${result.mergeStatus}" }
            val export = File(directory, EXPORT_PATH)
            val snapshot = core.importProjectFile(export, "system")
            val after = status(git.repository)
            SyncResult(SyncDisposition.PULLED, after, snapshot, "Pulled and imported ${snapshot.project.name}")
        }
    }

    suspend fun push(directory: File, token: String?): SyncResult = withContext(Dispatchers.IO) {
        open(directory).use { git ->
            requireClean(git)
            val branch = git.repository.branch
            val command = git.push().setRemote("origin").add("refs/heads/$branch:refs/heads/$branch")
            credentials(token)?.let(command::setCredentialsProvider)
            val updates = command.call().flatMap { it.remoteUpdates }
            val rejected = updates.firstOrNull { it.status.name.startsWith("REJECTED") }
            check(rejected == null) { "Push rejected: ${rejected?.message ?: rejected?.status}" }
            fetchInternal(git, token)
            val after = status(git.repository)
            SyncResult(SyncDisposition.PUSHED, after, message = "Pushed ${after.branch}")
        }
    }

    suspend fun sync(
        directory: File,
        token: String?,
    ): SyncResult = withContext(Dispatchers.IO) {
        open(directory).use { git ->
            if (!git.status().call().isClean || !liveProjectCheckpointed(directory)) {
                val dirty = status(git.repository)
                return@withContext SyncResult(
                    SyncDisposition.WORKTREE_DIRTY, dirty,
                    message = "Create a checkpoint before syncing"
                )
            }
            fetchInternal(git, token)
            val current = status(git.repository)
            when {
                current.ahead > 0 && current.behind > 0 -> SyncResult(
                    SyncDisposition.DIVERGED, current,
                    message = "Local and remote histories diverged; publish a branch or resolve on desktop"
                )
                current.behind > 0 -> {
                    val remote = remoteBranch(git.repository) ?: error("Remote branch not found")
                    validateRemoteExport(git.repository, remote)
                    val merge = git.merge().include(remote)
                        .setFastForward(MergeCommand.FastForwardMode.FF_ONLY).call()
                    check(merge.mergeStatus.isSuccessful) { "Fast-forward pull failed: ${merge.mergeStatus}" }
                    val snapshot = core.importProjectFile(File(directory, EXPORT_PATH), "system")
                    SyncResult(SyncDisposition.PULLED, status(git.repository), snapshot, "Pulled remote changes")
                }
                current.ahead > 0 -> {
                    val branch = git.repository.branch
                    val command = git.push().setRemote("origin").add("refs/heads/$branch:refs/heads/$branch")
                    credentials(token)?.let(command::setCredentialsProvider)
                    val updates = command.call().flatMap { it.remoteUpdates }
                    check(updates.none { it.status.name.startsWith("REJECTED") }) { "Remote rejected the push" }
                    fetchInternal(git, token)
                    SyncResult(SyncDisposition.PUSHED, status(git.repository), message = "Pushed local checkpoints")
                }
                else -> SyncResult(SyncDisposition.CURRENT, current, message = "Local and remote are current")
            }
        }
    }

    suspend fun status(directory: File): RepositoryStatus = withContext(Dispatchers.IO) {
        open(directory).use { status(it.repository) }
    }

    private fun fetchInternal(git: Git, token: String?) {
        ensureFetchRefSpec(git.repository)
        val command = git.fetch().setRemote("origin").setRemoveDeletedRefs(true)
        credentials(token)?.let(command::setCredentialsProvider)
        command.call()
    }

    /**
     * Repositories initialized in-app, and some repositories created by older clients, may
     * have an origin URL without a fetch mapping. Repairing that local Git metadata is safe
     * and prevents JGit from failing with "Nothing to fetch" after the first push.
     */
    private fun ensureFetchRefSpec(repository: Repository) {
        val config = repository.config
        if (config.getStringList("remote", "origin", "fetch").isEmpty()) {
            config.setString("remote", "origin", "fetch", DEFAULT_FETCH_REFSPEC)
            config.save()
        }
    }

    /**
     * Pulling imports the remote JSON over the live SQLite project, so edits made in Reed since the last
     * checkpoint must be committed first or they would be silently replaced.
     */
    private fun liveProjectCheckpointed(directory: File): Boolean {
        val export = File(directory, EXPORT_PATH)
        if (!export.isFile) return true
        val committed = runCatching { core.validateProjectJson(export.readText(Charsets.UTF_8)) }.getOrNull() ?: return true
        val live = runCatching { core.exportSnapshot(committed.project.id) }.getOrNull() ?: return true
        return comparable(live) == comparable(committed)
    }

    /** Order-insensitive view of a snapshot, so files written by desktop Reed compare equal to the same content here. */
    private fun comparable(snapshot: ProjectSnapshot): ProjectSnapshot = snapshot.copy(
        exportedAt = null,
        allocations = null,
        project = snapshot.project.copy(languages = snapshot.project.languages.distinct()),
        levels = snapshot.levels.sortedBy { it.id },
        scenes = snapshot.scenes.sortedBy { it.id },
        conversations = snapshot.conversations.sortedBy { it.id }.map { graph ->
            graph.copy(
                nodes = graph.nodes.sortedBy { it.id }.map { node -> node.copy(texts = node.texts.sortedBy { it.language }) },
                links = graph.links.sortedBy { it.id },
            )
        },
        characters = snapshot.characters.sortedBy { it.id },
        variables = snapshot.variables.sortedBy { it.id },
        partitions = snapshot.partitions.sortedBy { it.id },
        reviewSnapshots = snapshot.reviewSnapshots.sortedBy { it.id },
    )

    private fun requireClean(git: Git) {
        require(git.status().call().isClean) { "Create a checkpoint before pulling or pushing" }
    }

    private fun status(repository: Repository): RepositoryStatus {
        val branch = runCatching { repository.branch }.getOrDefault("main")
        val head = repository.resolve(Constants.HEAD)
        val remote = remoteBranch(repository)
        return RepositoryStatus(
            branch = branch,
            remoteUrl = repository.config.getString("remote", "origin", "url"),
            head = head?.name?.take(10),
            hasWorkingChanges = !Git(repository).status().call().isClean,
            ahead = countRange(repository, remote, head),
            behind = countRange(repository, head, remote),
        )
    }

    private fun countRange(repository: Repository, from: ObjectId?, to: ObjectId?): Int {
        if (from == null || to == null || from == to) return 0
        return Git(repository).log().addRange(from, to).call().count()
    }

    private fun remoteBranch(repository: Repository): ObjectId? {
        val branch = runCatching { repository.branch }.getOrDefault("main")
        return repository.resolve("refs/remotes/origin/$branch")
    }

    private fun validateRemoteExport(repository: Repository, commitId: ObjectId) {
        RevWalk(repository).use { walk ->
            val commit = walk.parseCommit(commitId)
            val tree = TreeWalk.forPath(repository, EXPORT_PATH, commit.tree)
                ?: error("Remote branch does not contain $EXPORT_PATH")
            tree.use {
                val bytes = repository.open(it.getObjectId(0)).bytes
                core.validateProjectJson(String(bytes, Charsets.UTF_8))
            }
        }
    }

    private fun credentials(token: String?) = token?.takeIf { it.isNotBlank() }
        ?.let { UsernamePasswordCredentialsProvider("x-access-token", it) }

    private fun open(directory: File): Git {
        val repository = FileRepositoryBuilder()
            .setGitDir(File(directory, ".git"))
            .readEnvironment()
            .build()
        return Git(repository)
    }

    companion object {
        const val EXPORT_PATH = "exports/reed-project.json"
        const val UNCHECKPOINTED_EDITS = "You have edits since your last checkpoint. Create a checkpoint before pulling so they are not overwritten."
        private const val DEFAULT_FETCH_REFSPEC = "+refs/heads/*:refs/remotes/origin/*"
    }
}
