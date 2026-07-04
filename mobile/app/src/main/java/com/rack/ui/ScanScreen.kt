package com.rack.ui

import com.rack.AppMode
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.DrawerValue
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.ModalDrawerSheet
import androidx.compose.material3.ModalNavigationDrawer
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.rememberDrawerState
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp
import com.rack.data.PendingSessionSummary
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

/**
 * Pantalla de escaneo. Dos vías de entrada: Honeywell por intents (MainActivity
 * llama vm.onScan) y campo wedge/manual. UX pensada para operario de tienda:
 * guía paso a paso, mueble activo destacado, estado de sync visible, botones
 * grandes y confirmación antes de perder un conteo.
 */
@Composable
fun ScanScreen(vm: ScanViewModel, onLogout: () -> Unit) {
    val state by vm.state.collectAsState()
    val pending by vm.pending.collectAsState()
    var wedge by remember { mutableStateOf("") }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()
    // Confirmación pendiente: "limpiar" | "salir" | "cambiar" (null = ninguna).
    var confirm by remember { mutableStateOf<String?>(null) }

    val totalUnits = state.lines.sumOf { it.quantity }

    if (state.priorPrompt != null) {
        AlertDialog(
            onDismissRequest = { },
            title = { Text("Mueble ya escaneado") },
            text = {
                Text(
                    "Este mueble ya tiene un conteo de ${state.priorPrompt} ítem(s) esta semana. " +
                        "¿Querés sumar al conteo anterior o reiniciarlo?",
                )
            },
            confirmButton = { Button(onClick = { vm.continueAdding() }) { Text("Sumar") } },
            dismissButton = { OutlinedButton(onClick = { vm.restartCount() }) { Text("Reiniciar") } },
        )
    }

    confirm?.let { which ->
        AlertDialog(
            onDismissRequest = { confirm = null },
            title = {
                Text(
                    when (which) {
                        "limpiar" -> "¿Limpiar el conteo?"
                        "salir" -> "¿Salir de la app?"
                        else -> "¿Cambiar de mueble?"
                    },
                )
            },
            text = { Text("Hay $totalUnits unidad(es) sin guardar. Se van a perder.") },
            confirmButton = {
                Button(onClick = {
                    confirm = null
                    if (which == "salir") onLogout() else vm.reset()
                }) { Text("Sí, continuar") }
            },
            dismissButton = { OutlinedButton(onClick = { confirm = null }) { Text("Cancelar") } },
        )
    }

    ModalNavigationDrawer(
        drawerState = drawerState,
        drawerContent = { PendingDrawer(pending) },
    ) {
        Column(modifier = Modifier.fillMaxSize()) {
            // Barra superior con el color del modo (azul = Reposición, verde = Inventario).
            Surface(color = MaterialTheme.colorScheme.primary, modifier = Modifier.fillMaxWidth()) {
                Row(
                    modifier = Modifier.fillMaxWidth().padding(horizontal = 8.dp, vertical = 10.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    IconButton(onClick = { scope.launch { drawerState.open() } }) {
                        Text(
                            "☰",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                    Column(modifier = Modifier.padding(start = 4.dp).weight(1f)) {
                        Text(
                            "Rack One",
                            style = MaterialTheme.typography.headlineSmall,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                        Text(
                            AppMode.label,
                            style = MaterialTheme.typography.titleMedium,
                            color = MaterialTheme.colorScheme.onPrimary,
                        )
                    }
                    // Estado de sincronización, siempre visible. Toca para ver el detalle.
                    Surface(
                        shape = RoundedCornerShape(16.dp),
                        color = MaterialTheme.colorScheme.onPrimary.copy(alpha = 0.18f),
                        modifier = Modifier.clickable { scope.launch { drawerState.open() } },
                    ) {
                        Text(
                            if (pending.isEmpty()) "✓ Al día" else "⏳ ${pending.size} por enviar",
                            style = MaterialTheme.typography.labelLarge,
                            color = MaterialTheme.colorScheme.onPrimary,
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 6.dp),
                        )
                    }
                }
            }

            Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
                // Paso actual: escanear mueble o productos.
                if (state.fixture == null) {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.08f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Column(
                            modifier = Modifier.padding(16.dp),
                            horizontalAlignment = Alignment.CenterHorizontally,
                        ) {
                            Text("1️⃣ Escaneá el código del MUEBLE", style = MaterialTheme.typography.titleMedium)
                            Text(
                                "Es la etiqueta pegada en el mueble",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                    }
                } else {
                    Surface(
                        shape = RoundedCornerShape(12.dp),
                        color = MaterialTheme.colorScheme.primary.copy(alpha = 0.10f),
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Row(
                            modifier = Modifier.padding(12.dp),
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    if (AppMode.isAudit) "2️⃣ Contando en:" else "2️⃣ Reponiendo en:",
                                    style = MaterialTheme.typography.bodySmall,
                                )
                                Text(state.fixture!!.name, style = MaterialTheme.typography.titleLarge)
                            }
                            OutlinedButton(onClick = {
                                if (totalUnits > 0) confirm = "cambiar" else vm.reset()
                            }) { Text("Cambiar") }
                        }
                    }
                }

                OutlinedTextField(
                    value = wedge,
                    onValueChange = { input ->
                        // El wedge suele terminar con salto de línea; al detectarlo, enviamos.
                        if (input.endsWith("\n")) {
                            vm.onScan(input.trim())
                            wedge = ""
                        } else {
                            wedge = input
                        }
                    },
                    label = {
                        Text(if (state.fixture == null) "Escaneá o escribí el código del mueble" else "Escaneá o escribí productos")
                    },
                    singleLine = true,
                    keyboardActions = androidx.compose.foundation.text.KeyboardActions(
                        onDone = {
                            if (wedge.isNotBlank()) {
                                vm.onScan(wedge.trim())
                                wedge = ""
                            }
                        },
                    ),
                    keyboardOptions = androidx.compose.foundation.text.KeyboardOptions(imeAction = ImeAction.Done),
                    modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp),
                )

                state.message?.let {
                    Surface(
                        shape = RoundedCornerShape(8.dp),
                        color = MaterialTheme.colorScheme.secondaryContainer,
                        modifier = Modifier.fillMaxWidth().padding(bottom = 8.dp),
                    ) {
                        Text(
                            it,
                            style = MaterialTheme.typography.bodyMedium,
                            modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        )
                    }
                }

                Divider()

                LazyColumn(modifier = Modifier.weight(1f)) {
                    items(state.lines, key = { it.sku }) { line ->
                        Row(
                            modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically,
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(line.sku)
                                if (line.name != line.sku) {
                                    Text(line.name, style = MaterialTheme.typography.bodySmall)
                                }
                            }
                            OutlinedButton(
                                onClick = { vm.setQuantity(line.sku, line.quantity - 1) },
                                modifier = Modifier.size(46.dp),
                                contentPadding = PaddingValues(0.dp),
                            ) { Text("−", style = MaterialTheme.typography.titleLarge) }
                            Text("  ${line.quantity}  ", style = MaterialTheme.typography.titleLarge)
                            OutlinedButton(
                                onClick = { vm.setQuantity(line.sku, line.quantity + 1) },
                                modifier = Modifier.size(46.dp),
                                contentPadding = PaddingValues(0.dp),
                            ) { Text("+", style = MaterialTheme.typography.titleLarge) }
                        }
                        Divider()
                    }
                }

                if (state.lines.isNotEmpty()) {
                    Text(
                        "Total: ${state.lines.size} código(s) · $totalUnits unidad(es)",
                        style = MaterialTheme.typography.titleMedium,
                        modifier = Modifier.padding(vertical = 6.dp),
                    )
                }

                // Acción principal grande; secundarias abajo.
                Button(
                    onClick = { vm.save() },
                    enabled = totalUnits > 0,
                    modifier = Modifier.fillMaxWidth().height(54.dp),
                ) {
                    Text(
                        if (totalUnits > 0) "GUARDAR ($totalUnits unid.)" else "GUARDAR",
                        style = MaterialTheme.typography.titleMedium,
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    OutlinedButton(
                        onClick = { if (totalUnits > 0) confirm = "limpiar" else vm.reset() },
                        modifier = Modifier.weight(1f),
                    ) { Text("Limpiar") }
                    OutlinedButton(
                        onClick = { vm.syncNow() },
                        modifier = Modifier.weight(1f),
                    ) { Text("Sincronizar") }
                    OutlinedButton(
                        onClick = { if (totalUnits > 0) confirm = "salir" else onLogout() },
                        modifier = Modifier.weight(1f),
                    ) { Text("Salir") }
                }
            }
        }
    }
}

/** Contenido del menú lateral: sesiones guardadas aún sin sincronizar. */
@Composable
private fun PendingDrawer(pending: List<PendingSessionSummary>) {
    val fmt = remember { SimpleDateFormat("dd/MM HH:mm", Locale.getDefault()) }
    ModalDrawerSheet {
        Column(modifier = Modifier.padding(16.dp)) {
            Text("Sesiones sin sincronizar", style = MaterialTheme.typography.titleLarge)
            Text(
                "Al sincronizarse desaparecen de esta lista.",
                style = MaterialTheme.typography.bodySmall,
            )
            Spacer(Modifier.height(12.dp))
            if (pending.isEmpty()) {
                Text("Todo sincronizado ✓", style = MaterialTheme.typography.bodyMedium)
            } else {
                LazyColumn {
                    items(pending, key = { it.clientUid }) { s ->
                        Column(modifier = Modifier.fillMaxWidth().padding(vertical = 8.dp)) {
                            Text(
                                s.fixtureName ?: "(mueble desconocido)",
                                style = MaterialTheme.typography.titleMedium,
                            )
                            Text(
                                "${if (s.kind == "restock") "Reposición" else "Inventario"} · " +
                                    "${s.skus} SKU · ${s.units} u.",
                                style = MaterialTheme.typography.bodyMedium,
                            )
                            Text(
                                "${s.week} · ${fmt.format(Date(s.scannedAt))}",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        Divider()
                    }
                }
            }
        }
    }
}
