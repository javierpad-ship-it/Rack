package com.rack.scanner

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.content.IntentFilter
import android.os.Bundle
import androidx.core.content.ContextCompat

/**
 * Integración con el lector del **Honeywell ScanPal EDA52** vía la Intent API de
 * Honeywell DataCollection (AIDC).
 *
 * Funciona sin el SDK propietario (.aar) y **se auto-configura**: al iniciar, la
 * app "reclama" el scanner por broadcast ([ACTION_CLAIM_SCANNER]) y le indica que
 * entregue las lecturas a nuestra acción ([action]) mediante las propiedades
 * `DPR_DATA_INTENT` / `DPR_DATA_INTENT_ACTION`. Así no hay que configurar a mano el
 * perfil DataCollection en cada equipo (Settings > Scanning). Al detenerse, libera
 * el scanner ([ACTION_RELEASE_SCANNER]).
 *
 * Todo es configurable por constructor para no acoplar a un firmware concreto y
 * permitir tests. Ver docs/SCANNER_EDA52.md.
 */
class HoneywellScannerProvider(
    private val context: Context,
    private val action: String = ACTION,
    private val dataKeys: List<String> = DATA_KEYS,
    private val scanner: String = SCANNER_IMAGER,
    private val profile: String = PROFILE_DEFAULT,
) : ScannerProvider {

    private var receiver: BroadcastReceiver? = null

    override fun start(onScan: (String) -> Unit) {
        if (receiver != null) return
        val r = object : BroadcastReceiver() {
            override fun onReceive(ctx: Context?, intent: Intent?) {
                if (intent == null) return
                val data = extractBarcode(dataKeys) { intent.getStringExtra(it) }
                if (data != null) onScan(data)
            }
        }
        receiver = r
        // El broadcast lo emite el servicio DataCollection (otra app): en Android 13+
        // con targetSdk 34 hay que registrar el receiver como exportado.
        ContextCompat.registerReceiver(
            context,
            r,
            IntentFilter(action),
            ContextCompat.RECEIVER_EXPORTED,
        )
        claimScanner()
    }

    override fun stop() {
        receiver?.let {
            releaseScanner()
            context.unregisterReceiver(it)
        }
        receiver = null
    }

    /** Reclama el scanner y lo configura para entregar lecturas a [action]. */
    private fun claimScanner() {
        val props = Bundle().apply {
            putBoolean(PROP_DATA_INTENT, true)
            putString(PROP_DATA_INTENT_ACTION, action)
        }
        context.sendBroadcast(
            Intent(ACTION_CLAIM_SCANNER).apply {
                setPackage(DCS_PACKAGE)
                putExtra(EXTRA_SCANNER, scanner)
                putExtra(EXTRA_PROFILE, profile)
                putExtra(EXTRA_PROPERTIES, props)
            },
        )
    }

    /** Libera el scanner reclamado. */
    private fun releaseScanner() {
        context.sendBroadcast(
            Intent(ACTION_RELEASE_SCANNER).apply {
                setPackage(DCS_PACKAGE)
                putExtra(EXTRA_SCANNER, scanner)
                putExtra(EXTRA_PROFILE, profile)
            },
        )
    }

    companion object {
        // Acción propia de la app a la que DataCollection enviará las lecturas.
        const val ACTION = "com.rack.scanner.BARCODE_DATA"

        // Claves de extra donde puede venir el dato del código ('data' es la estándar AIDC).
        val DATA_KEYS = listOf("data", "barcode_string", "com.honeywell.aidc.EXTRA_BARCODE_DATA")

        // Honeywell DataCollection service (Intent API).
        const val DCS_PACKAGE = "com.intermec.datacollectionservice"
        const val ACTION_CLAIM_SCANNER = "com.honeywell.aidc.action.ACTION_CLAIM_SCANNER"
        const val ACTION_RELEASE_SCANNER = "com.honeywell.aidc.action.ACTION_RELEASE_SCANNER"
        const val EXTRA_SCANNER = "com.honeywell.aidc.extra.EXTRA_SCANNER"
        const val EXTRA_PROFILE = "com.honeywell.aidc.extra.EXTRA_PROFILE"
        const val EXTRA_PROPERTIES = "com.honeywell.aidc.extra.EXTRA_PROPERTIES"

        // El imager interno del EDA52 y el perfil por defecto de DataCollection.
        const val SCANNER_IMAGER = "dcs.scanner.imager"
        const val PROFILE_DEFAULT = "DEFAULT"

        // Propiedades para redirigir las lecturas a [ACTION] vía intent.
        const val PROP_DATA_INTENT = "DPR_DATA_INTENT"
        const val PROP_DATA_INTENT_ACTION = "DPR_DATA_INTENT_ACTION"

        /**
         * Extrae el código leído de los extras del intent. Función pura (testeable):
         * [getExtra] devuelve el valor de una clave (o null). Retorna el primer valor
         * no vacío, recortado, o null si ninguno aplica.
         */
        fun extractBarcode(keys: List<String>, getExtra: (String) -> String?): String? {
            val raw = keys.firstNotNullOfOrNull { getExtra(it) } ?: return null
            val trimmed = raw.trim()
            return trimmed.ifBlank { null }
        }
    }
}
