package com.rack.ui

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.material3.Button
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.unit.dp

/**
 * Pantalla de escaneo. Soporta dos vías de entrada:
 *  - Honeywell por intents (registrado en MainActivity, llama a vm.onScan).
 *  - Wedge: campo de texto que captura la lectura y la envía con Enter.
 */
@Composable
fun ScanScreen(vm: ScanViewModel, onLogout: () -> Unit) {
    val state by vm.state.collectAsState()
    var wedge by remember { mutableStateOf("") }

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
            Text("Pend.: ${state.pendingCount}")
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
