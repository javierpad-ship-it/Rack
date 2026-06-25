package com.rack.ui

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.DisposableEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
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
            MaterialTheme {
                Surface {
                    var loggedIn by remember { mutableStateOf(session.isLoggedIn) }

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
