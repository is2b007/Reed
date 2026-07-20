package com.reed.core

import java.util.Locale

data class GameLanguageDefinition(
    val code: String,
    val englishName: String,
    val nativeName: String,
    val rightToLeft: Boolean = false,
    val steamCode: String? = null,
    val legacy: Boolean = false,
)

object GameLanguages {
    val catalog = listOf(
        GameLanguageDefinition("ar", "Arabic", "العربية", true, "arabic"),
        GameLanguageDefinition("bg", "Bulgarian", "Български", steamCode = "bulgarian"),
        GameLanguageDefinition("ca", "Catalan", "Català"),
        GameLanguageDefinition("zh-Hans", "Chinese (Simplified)", "简体中文", steamCode = "schinese"),
        GameLanguageDefinition("zh-Hant", "Chinese (Traditional)", "繁體中文", steamCode = "tchinese"),
        GameLanguageDefinition("hr", "Croatian", "Hrvatski"),
        GameLanguageDefinition("cs", "Czech", "Čeština", steamCode = "czech"),
        GameLanguageDefinition("da", "Danish", "Dansk", steamCode = "danish"),
        GameLanguageDefinition("nl", "Dutch", "Nederlands", steamCode = "dutch"),
        GameLanguageDefinition("en", "English", "English", steamCode = "english"),
        GameLanguageDefinition("en-AU", "English (Australia)", "English (Australia)"),
        GameLanguageDefinition("en-GB", "English (United Kingdom)", "English (United Kingdom)"),
        GameLanguageDefinition("en-US", "English (United States)", "English (United States)"),
        GameLanguageDefinition("fil", "Filipino", "Filipino"),
        GameLanguageDefinition("fi", "Finnish", "Suomi", steamCode = "finnish"),
        GameLanguageDefinition("fr", "French", "Français", steamCode = "french"),
        GameLanguageDefinition("fr-CA", "French (Canada)", "Français (Canada)"),
        GameLanguageDefinition("de", "German", "Deutsch", steamCode = "german"),
        GameLanguageDefinition("el", "Greek", "Ελληνικά", steamCode = "greek"),
        GameLanguageDefinition("he", "Hebrew", "עברית", true),
        GameLanguageDefinition("hi", "Hindi", "हिन्दी"),
        GameLanguageDefinition("hu", "Hungarian", "Magyar", steamCode = "hungarian"),
        GameLanguageDefinition("id", "Indonesian", "Bahasa Indonesia", steamCode = "indonesian"),
        GameLanguageDefinition("it", "Italian", "Italiano", steamCode = "italian"),
        GameLanguageDefinition("ja", "Japanese", "日本語", steamCode = "japanese"),
        GameLanguageDefinition("ko", "Korean", "한국어", steamCode = "koreana"),
        GameLanguageDefinition("ms", "Malay", "Bahasa Melayu", steamCode = "malay"),
        GameLanguageDefinition("no", "Norwegian", "Norsk", steamCode = "norwegian"),
        GameLanguageDefinition("fa", "Persian", "فارسی", true),
        GameLanguageDefinition("pl", "Polish", "Polski", steamCode = "polish"),
        GameLanguageDefinition("pt-PT", "Portuguese (Portugal)", "Português (Portugal)", steamCode = "portuguese"),
        GameLanguageDefinition("pt-BR", "Portuguese (Brazil)", "Português (Brasil)", steamCode = "brazilian"),
        GameLanguageDefinition("ro", "Romanian", "Română", steamCode = "romanian"),
        GameLanguageDefinition("ru", "Russian", "Русский", steamCode = "russian"),
        GameLanguageDefinition("sr-Cyrl", "Serbian (Cyrillic)", "Српски"),
        GameLanguageDefinition("sr-Latn", "Serbian (Latin)", "Srpski"),
        GameLanguageDefinition("sk", "Slovak", "Slovenčina"),
        GameLanguageDefinition("sl", "Slovenian", "Slovenščina"),
        GameLanguageDefinition("es-ES", "Spanish (Spain)", "Español (España)", steamCode = "spanish"),
        GameLanguageDefinition("es-419", "Spanish (Latin America)", "Español (Latinoamérica)", steamCode = "latam"),
        GameLanguageDefinition("sv", "Swedish", "Svenska", steamCode = "swedish"),
        GameLanguageDefinition("th", "Thai", "ไทย", steamCode = "thai"),
        GameLanguageDefinition("tr", "Turkish", "Türkçe", steamCode = "turkish"),
        GameLanguageDefinition("uk", "Ukrainian", "Українська", steamCode = "ukrainian"),
        GameLanguageDefinition("vi", "Vietnamese", "Tiếng Việt", steamCode = "vietnamese"),
        GameLanguageDefinition("griko", "Griko", "Griko", legacy = true),
        GameLanguageDefinition("x-griko", "Griko (private-use tag)", "Griko"),
    )

    private val byCode = catalog.associateBy { it.code.lowercase(Locale.ROOT) }
    private val tagPattern = Regex("^(?:(?:[A-Za-z]{2,3}(?:-[A-Za-z]{3}){0,3}|[A-Za-z]{5,8})(?:-[A-Za-z]{4})?(?:-(?:[A-Za-z]{2}|[0-9]{3}))?(?:-[A-Za-z0-9]{5,8}|-[0-9][A-Za-z0-9]{3})*(?:-[0-9A-WY-Za-wy-z](?:-[A-Za-z0-9]{2,8})+)*(?:-x(?:-[A-Za-z0-9]{1,8})+)?|x(?:-[A-Za-z0-9]{1,8})+)$")

    fun isValidTag(value: String): Boolean = value.length <= 63 && tagPattern.matches(value)

    fun canonicalize(value: String): String {
        val normalized = value.trim().replace('_', '-')
        if (normalized.equals("griko", ignoreCase = true)) return "griko"
        if (!isValidTag(normalized)) return normalized
        return Locale.forLanguageTag(normalized).toLanguageTag().takeUnless { it == "und" } ?: normalized
    }

    fun definition(code: String): GameLanguageDefinition? = byCode[canonicalize(code).lowercase(Locale.ROOT)]

    fun displayName(code: String): String = definition(code)?.englishName ?: code

    fun gameMarketPreset(): List<String> = catalog.filter { it.steamCode != null }.map { it.code }
}
