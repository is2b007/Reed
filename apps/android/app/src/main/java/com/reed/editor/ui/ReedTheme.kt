package com.reed.editor.ui

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

enum class ReedThemeMode { SYSTEM, DARK, LIGHT }

private val DarkColors = darkColorScheme(
    primary = Color(0xFFB6CB78),
    onPrimary = Color(0xFF18200F),
    primaryContainer = Color(0xFF283229),
    onPrimaryContainer = Color(0xFFEEF2EC),
    secondary = Color(0xFFB7C0B9),
    background = Color(0xFF0E1210),
    onBackground = Color(0xFFEEF2EC),
    surface = Color(0xFF171D19),
    onSurface = Color(0xFFEEF2EC),
    surfaceVariant = Color(0xFF1E2621),
    onSurfaceVariant = Color(0xFFB7C0B9),
    outline = Color(0xFF465249),
    outlineVariant = Color(0xFF2B352E),
    error = Color(0xFFD7776F),
    onError = Color(0xFF200403),
)

private val LightColors = lightColorScheme(
    primary = Color(0xFF526820),
    onPrimary = Color.White,
    primaryContainer = Color(0xFFDDE8BC),
    onPrimaryContainer = Color(0xFF1A2407),
    secondary = Color(0xFF596257),
    background = Color(0xFFF4F6F1),
    onBackground = Color(0xFF191D19),
    surface = Color(0xFFFBFCF8),
    onSurface = Color(0xFF191D19),
    surfaceVariant = Color(0xFFE9ECE5),
    onSurfaceVariant = Color(0xFF4D554D),
    outline = Color(0xFF6E776E),
    outlineVariant = Color(0xFFC8CEC5),
    error = Color(0xFF9B342E),
    onError = Color.White,
)

@Composable
fun ReedTheme(mode: ReedThemeMode, content: @Composable () -> Unit) {
    val dark = when (mode) {
        ReedThemeMode.SYSTEM -> isSystemInDarkTheme()
        ReedThemeMode.DARK -> true
        ReedThemeMode.LIGHT -> false
    }
    MaterialTheme(
        colorScheme = if (dark) DarkColors else LightColors,
        typography = Typography(),
        content = content,
    )
}
