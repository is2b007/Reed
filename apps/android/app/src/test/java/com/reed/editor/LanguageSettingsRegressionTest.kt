package com.reed.editor

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class LanguageSettingsRegressionTest {
    @Test
    fun androidExposesVersionedCatalogSettingsWithoutNetwork() {
        val activity = projectFile("app/src/main/java/com/reed/editor/MainActivity.kt").readText()
        val viewModel = projectFile("app/src/main/java/com/reed/editor/ReedViewModel.kt").readText()

        assertTrue(activity.contains("Workspace.SETTINGS -> ProjectSettingsWorkspace"))
        assertTrue(activity.contains("GameLanguages.gameMarketPreset()"))
        assertTrue(activity.contains("Custom BCP 47 tag"))
        assertTrue(activity.contains("Save language settings"))
        assertTrue(viewModel.contains("fun updateProjectLanguages(languages: List<String>, defaultLanguage: String)"))
        assertTrue(viewModel.contains("core.updateProjectLanguages(project.id, languages, defaultLanguage, project.version)"))
    }

    private fun projectFile(relativePath: String): File {
        var current = File(requireNotNull(System.getProperty("user.dir")))
        repeat(6) {
            val candidate = current.resolve(relativePath)
            if (candidate.isFile) return candidate
            current = current.parentFile ?: current
        }
        error("Project file not found: $relativePath")
    }
}
