package com.rack.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter

/**
 * Integración con Honeywell DataCollection vía broadcast intents.
 *
 * El servicio de escaneo de Honeywell emite un broadcast con el dato leído. La
 * acción y la clave del extra dependen de la configuración del equipo; los
 * valores por defecto siguen la "Honeywell Intent API" estándar y son
 * configurables aquí cuando se confirme el modelo.
 *
 * Para activar el envío de broadcasts hay que configurar en el equipo el perfil
 * de "Intent" del DataCollection (Settings > Scanning) apuntando a [ACTION].
 */
class HoneywellScannerProvider(
    private val context: Context,
    private val action: String = ACTION,
    private val dataKeys: List<String> = DATA_KEYS,
) : ScannerProvider {

    private var receiver: BroadcastReceiver? = null

    override fun start(onScan: (String) -> Unit) {
        if (receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val data = dataKeys.firstNotNullOfOrNull { intent.getStringExtra(it) }
                if (!data.isNullOrBlank()) onScan(data.trim())
            }
        }
        receiver = r
        context.registerReceiver(r, IntentFilter(action))
    }

    override fun stop() {
        receiver?.let { context.unregisterReceiver(it) }
        receiver = null
    }

    companion object {
        // Acción por defecto de la Honeywell Intent API. Ajustar al perfil del equipo.
        const val ACTION = "com.honeywell.sample.action.BARCODE_DATA"

        // Claves de extra habituales donde viene el dato del código.
        val DATA_KEYS = listOf("data", "barcode_string", "com.honeywell.aidc.EXTRA_BARCODE_DATA")
    }
}
