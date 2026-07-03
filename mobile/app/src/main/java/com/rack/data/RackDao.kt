package com.rack.data

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Transaction
import kotlinx.coroutines.flow.Flow

/** Resumen de una sesión local pendiente de sincronizar (para el menú). */
data class PendingSessionSummary(
    val clientUid: String,
    val fixtureName: String?,
    val week: String,
    val scannedAt: Long,
    val kind: String,
    val skus: Int,
    val units: Int,
)

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

    /** Última sesión local de un mueble en una semana (para sumar/reiniciar). */
    @Query("SELECT * FROM scan_sessions WHERE fixtureId = :fixtureId AND week = :week ORDER BY scannedAt DESC LIMIT 1")
    suspend fun lastSessionFor(fixtureId: String, week: String): ScanSessionEntity?

    @Query("SELECT * FROM scan_sessions WHERE synced = 0 ORDER BY scannedAt")
    suspend fun pendingSessions(): List<ScanSessionEntity>

    @Query("UPDATE scan_sessions SET synced = 1 WHERE clientUid = :uid")
    suspend fun markSynced(uid: String)

    @Query("SELECT COUNT(*) FROM scan_sessions WHERE synced = 0")
    suspend fun pendingCount(): Int

    /**
     * Sesiones guardadas aún sin sincronizar, con el nombre del mueble y el
     * total de SKUs/unidades. Es un Flow: al marcarse como sincronizada, la
     * sesión desaparece sola de la lista. Ordena de más reciente a más antigua.
     */
    @Query(
        """
        SELECT s.clientUid AS clientUid,
               f.name       AS fixtureName,
               s.week       AS week,
               s.scannedAt  AS scannedAt,
               s.kind       AS kind,
               COUNT(l.sku) AS skus,
               COALESCE(SUM(l.quantity), 0) AS units
        FROM scan_sessions s
        LEFT JOIN fixtures f  ON f.id = s.fixtureId
        LEFT JOIN scan_lines l ON l.sessionUid = s.clientUid
        WHERE s.synced = 0
        GROUP BY s.clientUid
        ORDER BY s.scannedAt DESC
        """,
    )
    fun pendingSessionSummaries(): Flow<List<PendingSessionSummary>>

    /** Guarda una sesión y sus líneas como una unidad transaccional. */
    @Transaction
    suspend fun saveScan(session: ScanSessionEntity, lines: List<ScanLineEntity>) {
        upsertSession(session)
        lines.forEach { upsertLine(it) }
    }
}
