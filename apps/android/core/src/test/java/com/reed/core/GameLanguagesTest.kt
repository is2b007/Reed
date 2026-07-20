package com.reed.core

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class GameLanguagesTest {
    @Test
    fun catalogCoversCommonGameLocalesAndCanonicalizesTags() {
        assertTrue(GameLanguages.catalog.size >= 40)
        assertTrue(GameLanguages.catalog.count { it.steamCode != null } >= 29)
        assertEquals(GameLanguages.catalog.size, GameLanguages.catalog.map { it.code.lowercase() }.distinct().size)
        assertEquals("pt-BR", GameLanguages.canonicalize("pt_br"))
        assertEquals("zh-Hans", GameLanguages.canonicalize("zh-hans"))
        assertEquals("griko", GameLanguages.canonicalize("GRIKO"))
        assertTrue(GameLanguages.isValidTag("x-studio-dialect"))
    }
}
