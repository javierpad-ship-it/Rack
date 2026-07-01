package com.rack

/**
 * Distingue las dos apps compiladas desde el mismo código (product flavors):
 *  - Rack One - Inventario ("audit"): conteo completo del mueble.
 *  - Rack One - Repo ("restock"): reposición incremental (1-2 productos),
 *    siempre suma, nunca reemplaza.
 */
object AppMode {
    val kind: String = BuildConfig.APP_KIND // "audit" | "restock"
    val isAudit: Boolean get() = kind == "audit"
    val label: String get() = if (isAudit) "Inventario" else "Reposición"
}
