package com.rack.scanner

/**
 * Fallback "keyboard wedge": muchos lectores (incluidos los Honeywell en modo
 * wedge) emulan un teclado y terminan la lectura con Enter. En ese modo la UI
 * captura el texto en un campo y llama a [submit] al recibir Enter.
 *
 * No requiere intents; sirve para desarrollo y equipos no Honeywell.
 */
class WedgeScannerProvider : ScannerProvider {
    private var callback: ((String) -> Unit)? = null

    override fun start(onScan: (String) -> Unit) {
        callback = onScan
    }

    override fun stop() {
        callback = null
    }

    /** La UI invoca esto cuando el campo de captura recibe una lectura completa. */
    fun submit(code: String) {
        val trimmed = code.trim()
        if (trimmed.isNotEmpty()) callback?.invoke(trimmed)
    }
}
