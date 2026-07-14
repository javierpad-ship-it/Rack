package com.rack.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.platform.LocalLifecycleOwner
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.LifecycleEventObserver
import com.rack.net.SessionStore
import com.rack.scanner.HoneywellScannerProvider
import com.rack.sync.SyncScheduler

class MainActivity : ComponentActivity() {
    private val scanVm: ScanViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        val session = SessionStore(this)
        SyncScheduler.schedulePeriodic(this)

        setContent {
            RackTheme {
                Surface {
                    var loggedIn by remember { mutableStateOf(session.isLoggedIn) }

                    // El SyncWorker (background) puede limpiar la sesión si el refresh
                    // token queda inválido (ver gotcha del sync trabado en silencio). Sin
                    // esto, una app ya abierta en la pantalla de escaneo nunca se enteraba
                    // y quedaba "Sincronizando…" para siempre sin pedir volver a loguear.
                    val lifecycleOwner = LocalLifecycleOwner.current
                    DisposableEffect(lifecycleOwner) {
                        val observer = LifecycleEventObserver { _, event ->
                            if (event == Lifecycle.Event.ON_RESUME) loggedIn = session.isLoggedIn
                        }
                        lifecycleOwner.lifecycle.addObserver(observer)
                        onDispose { lifecycleOwner.lifecycle.removeObserver(observer) }
                    }

                    if (!loggedIn) {
                        LoginScreen(session = session, onLoggedIn = {
                            loggedIn = true
                            SyncScheduler.syncNow(this) // baja catálogo/muebles al entrar
                        })
                    } else {
                        // Registra el scanner Honeywell mientras la pantalla está activa.
                        DisposableEffect(Unit) {
                            val scanner = HoneywellScannerProvider(this@MainActivity)
                            scanner.start { code -> scanVm.onScan(code) }
                            onDispose { scanner.stop() }
                        }
                        ScanScreen(vm = scanVm, onLogout = {
                            session.clear()
                            loggedIn = false
                        })
                    }
                }
            }
        }
    }
}
