package com.reed.git

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Stores optional Git HTTPS credentials encrypted by Android Keystore. */
class SecureTokenStore(context: Context) {
    private val preferences = context.getSharedPreferences("reed.git.credentials", Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun save(repositoryUrl: String, token: String) {
        require(token.isNotBlank()) { "Token is empty" }
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(token.toByteArray(StandardCharsets.UTF_8))
        val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
        preferences.edit().putString(preferenceKey(repositoryUrl), payload).apply()
    }

    fun load(repositoryUrl: String): String? {
        val payload = preferences.getString(preferenceKey(repositoryUrl), null) ?: return null
        return runCatching {
            val (iv, encrypted) = payload.split(":", limit = 2)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP))
            )
            String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8)
        }.getOrNull()
    }

    fun clear(repositoryUrl: String) {
        preferences.edit().remove(preferenceKey(repositoryUrl)).apply()
    }

    private fun secretKey(): SecretKey {
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(
                KEY_ALIAS,
                KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
            )
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build()
        )
        return generator.generateKey()
    }

    private fun preferenceKey(repositoryUrl: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(repositoryUrl.toByteArray(StandardCharsets.UTF_8))
        return "token." + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE)
    }

    companion object {
        private const val KEY_ALIAS = "reed.git.https.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
