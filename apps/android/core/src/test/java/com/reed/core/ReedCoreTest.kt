package com.reed.core

import androidx.test.core.app.ApplicationProvider
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Assert.fail
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [33])
class ReedCoreTest {
    private lateinit var core: ReedCore

    @Before
    fun setup() {
        core = ReedCore(ApplicationProvider.getApplicationContext(), "test-${System.nanoTime()}.sqlite")
    }

    @After
    fun teardown() {
        core.close()
    }

    @Test
    fun deterministicExportRoundTripsEveryConfiguredLanguage() {
        val created = core.createProject("The Salt Gate", "the-salt-gate")
        val graph = created.conversations.single()
        var version = graph.version
        val line = core.createNode(created.project.id, graph.id, NodeKind.LINE, 320.0, 180.0, version)
        version = line.version
        val texts = mapOf(
            "en" to "The gate remembers.",
            "el" to "Η πύλη θυμάται.",
            "it" to "Il cancello ricorda.",
            "de" to "Das Tor erinnert sich.",
            "griko" to "I porta en grazzi." ,
        )
        texts.forEach { (language, text) ->
            version = core.setNodeText(created.project.id, line.value.lineId, language, text, null, version).version
        }

        val first = core.exportProjectJson(created.project.id)
        core.importSnapshot(first)
        val second = core.exportProjectJson(created.project.id)

        assertEquals(first, second)
        texts.values.forEach { assertTrue(second.contains(it)) }
        assertTrue(second.contains("\"exportedAt\": null"))
    }

    @Test
    fun localizedCharacterNamesRoundTripWithoutConcreteMapSerialization() {
        val created = core.createProject("Character Test", "character-test")
        val names = sortedMapOf(
            "el" to "Αριάδνη",
            "en" to "Ariadne",
            "it" to "Arianna",
        )

        core.upsertCharacter(
            projectId = created.project.id,
            id = null,
            name = "Ariadne",
            displayNames = names,
            isPlayer = false,
            description = "Keeper of the gate",
            actorNotes = "Measured",
            voiceNotes = "Warm",
            expectedVersion = created.project.version,
        )
        val serialized = core.exportProjectJson(created.project.id)
        core.importSnapshot(serialized)

        val restored = core.projectOverview(created.project.id).characters.single()
        assertEquals(names, restored.displayNames)
    }

    @Test
    fun mutationsEnforceOptimisticVersionAndRecordedTextReturnsToRework() {
        val created = core.createProject("Voice Test", "voice-test")
        val graph = created.conversations.single()
        val node = core.createNode(created.project.id, graph.id, NodeKind.LINE, 100.0, 100.0, graph.version)
        val snapshot = core.exportSnapshot(created.project.id)
        val recorded = snapshot.copy(
            conversations = snapshot.conversations.map { conversation ->
                conversation.copy(nodes = conversation.nodes.map {
                    if (it.id == node.value.id) it.copy(voiceStatus = VoiceStatus.RECORDED) else it
                })
            }
        )
        core.importSnapshot(recorded)

        val changed = core.setNodeText(
            created.project.id, node.value.lineId, "en", "A revised recording line", null,
            expectedVersion = recorded.conversations.single().version
        )
        assertEquals(VoiceStatus.REWORK, core.conversationGraph(graph.id).nodes.first { it.id == node.value.id }.voiceStatus)

        try {
            core.setNodeText(created.project.id, node.value.lineId, "en", "stale", null, recorded.conversations.single().version)
            fail("Expected a version conflict")
        } catch (error: VersionConflictException) {
            assertEquals(changed.version, error.actual)
        }
    }

    @Test
    fun deletionRequiresThePermanentLineIdAndNeverDeletesStart() {
        val created = core.createProject("Delete Test", "delete-test")
        val graph = created.conversations.single()
        val line = core.createNode(created.project.id, graph.id, NodeKind.CHOICE, 200.0, 200.0, graph.version)

        try {
            core.deleteNode(created.project.id, line.value.lineId, "wrong-id", line.version)
            fail("Expected confirmation failure")
        } catch (_: IllegalArgumentException) {
            // expected
        }
        assertTrue(core.conversationGraph(graph.id).nodes.any { it.id == line.value.id })

        val result = core.deleteNode(created.project.id, line.value.lineId, line.value.lineId, line.version)
        assertEquals(line.value.lineId, result.value)
        assertTrue(core.conversationGraph(graph.id).nodes.none { it.id == line.value.id })
    }
}
