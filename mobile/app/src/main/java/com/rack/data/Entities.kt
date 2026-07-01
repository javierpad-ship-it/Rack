package com.rack.data

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey

/** Catálogo cacheado localmente (subset de la tienda) para resolver SKU offline. */
@Entity(tableName = "products")
data class ProductEntity(
    @PrimaryKey val sku: String,
    val ean: String?,
    val name: String,
    val family: String?,
)

/** Muebles de la tienda, cacheados para escanear offline. */
@Entity(tableName = "fixtures")
data class FixtureEntity(
    @PrimaryKey val id: String,
    val storeId: String,
    val barcode: String,
    val name: String,
    val active: Boolean,
)

/**
 * Sesión de escaneo local. [clientUid] es un id estable generado en el cliente
 * para que el sync al servidor sea idempotente. [synced] marca si ya se subió.
 */
@Entity(
    tableName = "scan_sessions",
    indices = [Index("clientUid", unique = true), Index("synced")],
)
data class ScanSessionEntity(
    @PrimaryKey val clientUid: String,
    val storeId: String,
    val fixtureId: String,
    val week: String,
    val scannedAt: Long,        // epoch millis
    val synced: Boolean = false,
    val kind: String = "audit", // "audit" (Inventario) | "restock" (Repo)
)

/** Línea (SKU + cantidad) dentro de una sesión local. */
@Entity(
    tableName = "scan_lines",
    primaryKeys = ["sessionUid", "sku"],
    indices = [Index("sessionUid")],
)
data class ScanLineEntity(
    val sessionUid: String,
    val sku: String,
    val quantity: Int,
)
