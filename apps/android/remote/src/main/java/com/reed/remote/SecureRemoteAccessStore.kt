package com.reed.remote

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import java.nio.charset.StandardCharsets
import java.security.KeyStore
import java.security.MessageDigest
import java.security.SecureRandom
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

/** Keeps the stable Claude connector capability encrypted by Android Keystore. */
class SecureRemoteAccessStore(context: Context) {
    private val preferences = context.getSharedPreferences("reed.remote.credentials", Context.MODE_PRIVATE)
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
    private val random = SecureRandom()
    private val json = Json { encodeDefaults = true }

    fun loadOrCreate(projectId: String): RemoteAccessCredentials {
        load(projectId)?.let { return it }
        return RemoteAccessCredentials(
            channelId = "reed_" + randomValue(24),
            deviceToken = "rdv_" + randomValue(32),
            connectorToken = "rcc_" + randomValue(32),
        ).also { save(projectId, it) }
    }

    fun load(projectId: String): RemoteAccessCredentials? {
        val payload = preferences.getString(preferenceKey(projectId), null) ?: return null
        return runCatching {
            val (iv, encrypted) = payload.split(":", limit = 2)
            val cipher = Cipher.getInstance(TRANSFORMATION)
            cipher.init(
                Cipher.DECRYPT_MODE,
                secretKey(),
                GCMParameterSpec(128, Base64.decode(iv, Base64.NO_WRAP)),
            )
            val serialized = String(cipher.doFinal(Base64.decode(encrypted, Base64.NO_WRAP)), StandardCharsets.UTF_8)
            json.decodeFromString<RemoteAccessCredentials>(serialized)
        }.getOrNull()
    }

    fun reset(projectId: String) {
        preferences.edit().remove(preferenceKey(projectId)).apply()
    }

    private fun save(projectId: String, credentials: RemoteAccessCredentials) {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(json.encodeToString(credentials).toByteArray(StandardCharsets.UTF_8))
        val payload = Base64.encodeToString(cipher.iv, Base64.NO_WRAP) + ":" +
            Base64.encodeToString(encrypted, Base64.NO_WRAP)
        preferences.edit().putString(preferenceKey(projectId), payload).apply()
    }

    private fun randomValue(byteCount: Int): String {
        val bytes = ByteArray(byteCount).also(random::nextBytes)
        return Base64.encodeToString(bytes, Base64.NO_WRAP or Base64.NO_PADDING or Base64.URL_SAFE)
    }

    private fun secretKey(): SecretKey {
        (keyStore.getKey(KEY_ALIAS, null) as? SecretKey)?.let { return it }
        val generator = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore")
        generator.init(
            KeyGenParameterSpec.Builder(KEY_ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setUserAuthenticationRequired(false)
                .build(),
        )
        return generator.generateKey()
    }

    private fun preferenceKey(projectId: String): String {
        val digest = MessageDigest.getInstance("SHA-256").digest(projectId.toByteArray(StandardCharsets.UTF_8))
        return "channel." + Base64.encodeToString(digest, Base64.NO_WRAP or Base64.URL_SAFE)
    }

    companion object {
        private const val KEY_ALIAS = "reed.remote.capability.v1"
        private const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}
