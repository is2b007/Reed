package com.reed.git

import androidx.test.core.app.ApplicationProvider
import com.reed.core.NodeKind
import com.reed.core.ReedCore
import kotlinx.coroutines.runBlocking
import org.eclipse.jgit.api.Git
import org.eclipse.jgit.lib.Constants
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.nio.file.Files

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class GitRepositoryServiceTest {
    private lateinit var core: ReedCore

    @Before
    fun setup() {
        core = ReedCore(ApplicationProvider.getApplicationContext(), "git-test-${System.nanoTime()}.sqlite")
    }

    @After
    fun teardown() {
        core.close()
    }

    @Test
    fun checkpointAndPushUseOnlyALocalBareRemote() = runBlocking {
        val root = Files.createTempDirectory("reed-git-test").toFile()
        val remote = root.resolve("remote.git")
        val worktree = root.resolve("worktree")
        Git.init().setBare(true).setInitialBranch("main").setDirectory(remote).call().close()
        Git.init().setInitialBranch("main").setDirectory(worktree).call().use { git ->
            git.repository.config.apply {
                setString("remote", "origin", "url", remote.toURI().toString())
                save()
            }
        }
        val snapshot = core.createProject("Local Git", "local-git")
        val service = GitRepositoryService(core)
        val identity = GitIdentity("Reed Test", "reed@example.invalid")

        val checkpoint = service.checkpoint(worktree, snapshot.project.id, "Initial project", identity)
        assertEquals("main", checkpoint.branch)
        service.push(worktree, token = null)

        Git.open(remote).use { bare ->
            assertNotNull(bare.repository.resolve(Constants.R_HEADS + "main"))
        }

        val graph = snapshot.conversations.single()
        core.createNode(snapshot.project.id, graph.id, NodeKind.LINE, 300.0, 200.0, snapshot.project.version)
        service.checkpoint(worktree, snapshot.project.id, "Add first line", identity)
        val pushed = service.push(worktree, token = null)
        assertEquals(0, pushed.status.ahead)
        assertEquals(0, pushed.status.behind)

        val cloneCore = ReedCore(
            ApplicationProvider.getApplicationContext(),
            "git-clone-test-${System.nanoTime()}.sqlite",
        )
        try {
            val cloneDirectory = root.resolve("clone")
            val cloneService = GitRepositoryService(cloneCore, allowLocalFileRemotes = true)
            val cloned = cloneService.clone(remote.toURI().toString(), cloneDirectory, token = null)
            assertEquals(SyncDisposition.CLONED, cloned.disposition)
            assertEquals(2, cloneCore.conversationGraph(graph.id).nodes.size)

            val currentGraph = core.conversationGraph(graph.id)
            core.createNode(
                snapshot.project.id,
                graph.id,
                NodeKind.CHOICE,
                500.0,
                320.0,
                currentGraph.version,
            )
            service.checkpoint(worktree, snapshot.project.id, "Add remote choice", identity)
            service.push(worktree, token = null)

            val fetched = cloneService.fetch(cloneDirectory, token = null)
            assertEquals(1, fetched.behind)
            val pulled = cloneService.pullFastForward(cloneDirectory, token = null)
            assertEquals(SyncDisposition.PULLED, pulled.disposition)
            assertEquals(3, cloneCore.conversationGraph(graph.id).nodes.size)

            val cloneGraph = cloneCore.conversationGraph(graph.id)
            cloneCore.createNode(
                snapshot.project.id,
                graph.id,
                NodeKind.GROUP,
                680.0,
                360.0,
                cloneGraph.version,
            )
            cloneService.checkpoint(cloneDirectory, snapshot.project.id, "Add tablet junction", identity)
            val synced = cloneService.sync(cloneDirectory, token = null)
            assertEquals(SyncDisposition.PUSHED, synced.disposition)
            assertEquals(0, synced.status.ahead)
            assertEquals(0, synced.status.behind)
        } finally {
            cloneCore.close()
        }
    }
}
