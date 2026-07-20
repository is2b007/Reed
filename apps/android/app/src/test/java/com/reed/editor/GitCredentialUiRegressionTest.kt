package com.reed.editor

import java.io.File
import org.junit.Assert.assertTrue
import org.junit.Test

class GitCredentialUiRegressionTest {
    @Test
    fun connectedRepositoryCanReplaceItsEncryptedTokenWithoutReclone() {
        val activity = projectFile("app/src/main/java/com/reed/editor/MainActivity.kt").readText()
        val viewModel = projectFile("app/src/main/java/com/reed/editor/ReedViewModel.kt").readText()

        assertTrue(activity.contains("3 · Repository access"))
        assertTrue(activity.contains("PasswordVisualTransformation()"))
        assertTrue(activity.contains("viewModel.updateRepositoryToken(token)"))
        assertTrue(activity.contains("viewModel::clearRepositoryToken"))
        assertTrue(viewModel.contains("fun updateRepositoryToken(token: String)"))
        assertTrue(viewModel.contains("app.tokens.save(repository.url, token.trim())"))
        assertTrue(viewModel.contains("fun clearRepositoryToken()"))
        assertTrue(viewModel.contains("repositoryTokenConfigured = false"))
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
