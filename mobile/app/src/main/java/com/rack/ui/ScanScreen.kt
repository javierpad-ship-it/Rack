package com.rack.ui

import com.rack.AppMode
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
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
 * Pantalla de escaneo. Soporta dos vías de entrada:
 *  - Honeywell por intents (registrado en MainActivity, llama a vm.onScan).
 *  - Wedge: campo de texto que captura la lectura y la envía con Enter.
 */
@Composable
fun ScanScreen(vm: ScanViewModel, onLogout: () -> Unit) {
    val state by vm.state.collectAsState()
    val pending by vm.pending.collectAsState()
    var wedge by remember { mutableStateOf("") }
    val drawerState = rememberDrawerState(DrawerValue.Closed)
    val scope = rememberCoroutineScope()

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
                        "☰", // ☰ menú hamburguesa
                        style = MaterialTheme.typography.headlineSmall,
                        color = MaterialTheme.colorScheme.onPrimary,
                    )
                }
                Column(modifier = Modifier.padding(start = 4.dp)) {
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
            }
        }

      Column(modifier = Modifier.fillMaxSize().padding(16.dp)) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Text(
                state.fixture?.let { "Mueble: ${it.name}" } ?: "Escaneá un mueble",
                style = MaterialTheme.typography.titleMedium,
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text("Pend.: ${state.pendingCount}")
                OutlinedButton(
                    onClick = { vm.syncNow() },
                    modifier = Modifier.padding(start = 8.dp),
                ) { Text("Sincronizar") }
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
            label = { Text("Lectura (scanner o manual)") },
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

        state.message?.let { Text(it, modifier = Modifier.padding(bottom = 8.dp)) }

        Divider()

        LazyColumn(modifier = Modifier.weight(1f)) {
            items(state.lines, key = { it.sku }) { line ->
                Row(
                    modifier = Modifier.fillMaxWidth().padding(vertical = 6.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(line.name)
                        Text(line.sku, style = MaterialTheme.typography.bodySmall)
                    }
                    OutlinedButton(onClick = { vm.setQuantity(line.sku, line.quantity - 1) }) { Text("-") }
                    Text("  ${line.quantity}  ", style = MaterialTheme.typography.titleMedium)
                    OutlinedButton(onClick = { vm.setQuantity(line.sku, line.quantity + 1) }) { Text("+") }
                }
                Divider()
            }
        }

        Row(
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
        ) {
            Button(onClick = { vm.save() }, modifier = Modifier.weight(1f)) { Text("Guardar sesión") }
            OutlinedButton(onClick = { vm.reset() }) { Text("Limpiar") }
            OutlinedButton(onClick = onLogout) { Text("Salir") }
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
