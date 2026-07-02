package com.rack.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import com.rack.AppMode

// Colores del color scheme de Compose (botones, acentos), en espejo de los
// colores nativos (colors.xml por flavor): verde = Inventario, azul = Repo.
private val InventarioScheme = lightColorScheme(
    primary = Color(0xFF16A34A),
    onPrimary = Color.White,
    secondary = Color(0xFF0F5132),
)
private val RepoScheme = lightColorScheme(
    primary = Color(0xFF2B5BE2),
    onPrimary = Color.White,
    secondary = Color(0xFF102A43),
)

@Composable
fun RackTheme(content: @Composable () -> Unit) {
    val scheme = if (AppMode.isAudit) InventarioScheme else RepoScheme
    MaterialTheme(colorScheme = scheme, content = content)
}
