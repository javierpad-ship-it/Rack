package com.rack.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction

@Dao
interface RackDao {

    // ---- Catálogo / muebles (cache) ----
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertProducts(products: List<ProductEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertFixtures(fixtures: List<FixtureEntity>)

    @Query("SELECT * FROM products WHERE sku = :sku LIMIT 1")
    suspend fun findProduct(sku: String): ProductEntity?

    @Query("SELECT * FROM fixtures WHERE barcode = :barcode AND active = 1 LIMIT 1")
    suspend fun findFixtureByBarcode(barcode: String): FixtureEntity?

    @Query("SELECT * FROM fixtures WHERE storeId = :storeId ORDER BY name")
    suspend fun fixturesForStore(storeId: String): List<FixtureEntity>

    // ---- Escaneo (offline) ----
    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertSession(session: ScanSessionEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertLine(line: ScanLineEntity)

    @Query("SELECT * FROM scan_lines WHERE sessionUid = :uid ORDER BY sku")
    suspend fun linesForSession(uid: String): List<ScanLineEntity>

    @Query("SELECT * FROM scan_sessions WHERE synced = 0 ORDER BY scannedAt")
    suspend fun pendingSessions(): List<ScanSessionEntity>

    @Query("UPDATE scan_sessions SET synced = 1 WHERE clientUid = :uid")
    suspend fun markSynced(uid: String)

    @Query("SELECT COUNT(*) FROM scan_sessions WHERE synced = 0")
    suspend fun pendingCount(): Int

    /** Guarda una sesión y sus líneas como una unidad transaccional. */
    @Transaction
    suspend fun saveScan(session: ScanSessionEntity, lines: List<ScanLineEntity>) {
        upsertSession(session)
        lines.forEach { upsertLine(it) }
    }
}
