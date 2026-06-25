package com.rack.scanner

/**
 * Abstracción del lector de código de barras.
 *
 * Se implementa de forma genérica para que la lógica de la app no dependa del
 * modelo de equipo. Hoy hay dos implementaciones:
 *  - [HoneywellScannerProvider]: integración por intents de Honeywell DataCollection.
 *  - [WedgeScannerProvider]: fallback "keyboard wedge" (el scanner emula teclado),
 *    útil para desarrollo y para equipos no Honeywell.
 *
 * El modelo Honeywell final está pendiente de confirmar (ver docs/PREGUNTAS_PENDIENTES.md).
 */
interface ScannerProvider {
    /** Comienza a escuchar lecturas. [onScan] recibe el contenido del código. */
    fun start(onScan: (String) -> Unit)

    /** Deja de escuchar. */
    fun stop()
}
