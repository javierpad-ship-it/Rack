package com.rack.sync

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import com.rack.data.RackDatabase
import com.rack.net.ScanLineDto
import com.rack.net.ScanSessionDto
import com.rack.net.SessionStore
import com.rack.net.SupabaseClient
import java.time.Instant

/**
 * Empuja al servidor las sesiones de escaneo pendientes (offline-first) y
 * baja el catálogo/muebles actualizados de la tienda. Idempotente vía client_uid.
 * Se reintenta automáticamente (WorkManager) si no hay red.
 */
class SyncWorker(
    appContext: Context,
    params: WorkerParameters,
) : CoroutineWorker(appContext, params) {

    private val db = RackDatabase.get(appContext)
    private val session = SessionStore(appContext)
    private val api = SupabaseClient()

    override suspend fun doWork(): Result {
        var token = session.accessToken ?: return Result.success() // sin sesión, nada que hacer
        return try {
            try {
                pushPending(token)
                pullCatalog(token)
            } catch (e: Exception) {
                // El access token de Supabase caduca (~1 h): ante un 401,
                // renovamos con el refresh token y reintentamos una vez.
                if (e.message?.contains("401") == true) {
                    val refresh = session.refreshToken ?: throw e
                    val renewed = api.refreshSession(refresh)
                    session.accessToken = renewed.accessToken
                    session.refreshToken = renewed.refreshToken
                    token = renewed.accessToken
                    pushPending(token)
                    pullCatalog(token)
                } else {
                    throw e
                }
            }
            Result.success()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    private suspend fun pushPending(token: String) {
        val dao = db.dao()
        for (s in dao.pendingSessions()) {
            val serverId = api.upsertSession(
                token,
                ScanSessionDto(
                    clientUid = s.clientUid,
                    storeId = s.storeId,
                    fixtureId = s.fixtureId,
                    week = s.week,
                    scannedAt = Instant.ofEpochMilli(s.scannedAt).toString(),
                    kind = s.kind,
                ),
            )
            val lines = dao.linesForSession(s.clientUid).map {
                ScanLineDto(sessionId = serverId, sku = it.sku, quantity = it.quantity)
            }
            api.upsertLines(token, lines)
            dao.markSynced(s.clientUid)
        }
    }

    // La app solo RECOGE datos: no baja el catálogo de productos (107k variantes
    // hacían lento el sync y no aportan al escaneo). Solo se cachean los muebles
    // de la tienda, necesarios para reconocer el código del mueble offline.
    private suspend fun pullCatalog(token: String) {
        val dao = db.dao()
        val storeId = session.storeId ?: return
        val fixtures = api.fetchFixtures(token, storeId).map {
            com.rack.data.FixtureEntity(it.id, it.storeId, it.barcode, it.name, it.active)
        }
        if (fixtures.isNotEmpty()) dao.upsertFixtures(fixtures)
    }

    companion object {
        const val UNIQUE_NAME = "rack_sync"
    }
}
