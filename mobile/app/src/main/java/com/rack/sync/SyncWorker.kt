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
        if (session.accessToken == null) return Result.success() // sin sesión, nada que hacer
        return try {
            val allPushed = pushPending()
            // El catálogo de muebles no es crítico para NO perder datos: si falla,
            // no debe arrastrar a los escaneos ya subidos. Se reintenta la próxima.
            try { pullCatalog() } catch (_: Exception) {}
            // Si algún escaneo quedó pendiente, reprogramar para reintentarlo.
            if (allPushed) Result.success() else Result.retry()
        } catch (e: Exception) {
            Result.retry()
        }
    }

    /**
     * Sube cada sesión pendiente de forma INDEPENDIENTE: si una falla (dato
     * rechazado por el servidor, RLS, etc.) se saltea y se sigue con las demás,
     * en vez de bloquear toda la cola detrás de la primera que falle.
     * Devuelve `true` solo si se subieron todas.
     */
    private suspend fun pushPending(): Boolean {
        val dao = db.dao()
        var allPushed = true
        var refreshTried = false
        for (s in dao.pendingSessions()) {
            try {
                pushOne(dao, s)
            } catch (e: Exception) {
                // El access token de Supabase caduca (~1 h): ante un 401,
                // renovamos con el refresh token y reintentamos esta sesión.
                if (isUnauthorized(e) && !refreshTried) {
                    refreshTried = true
                    if (!renewToken()) return false // sin sesión válida no seguimos
                    try {
                        pushOne(dao, s)
                    } catch (e2: Exception) {
                        allPushed = false
                    }
                } else {
                    // Error puntual de esta sesión: la dejamos pendiente y
                    // seguimos con el resto para no perder las demás.
                    allPushed = false
                }
            }
        }
        return allPushed
    }

    /** Sube una sesión (cabecera + líneas) y la marca como sincronizada. */
    private suspend fun pushOne(dao: com.rack.data.RackDao, s: com.rack.data.ScanSessionEntity) {
        val serverId = api.upsertSession(
            session.accessToken!!,
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
        api.upsertLines(session.accessToken!!, lines)
        dao.markSynced(s.clientUid)
    }

    private fun isUnauthorized(e: Exception): Boolean = e.message?.contains("401") == true

    /**
     * Renueva el access token con el refresh token. `false` si no se pudo.
     *
     * Si Supabase rechaza el refresh token (401/400 — p. ej. "Already Used" tras
     * una carrera renovación/crash), reintentar por siempre no sirve: el token
     * quedó permanentemente inválido y solo un login nuevo genera uno válido.
     * Se limpia la sesión para que la próxima vez que se abra la app (o vuelva
     * a primer plano) MainActivity la vea deslogueada y pida login, en vez de
     * quedar "Sincronizando…" para siempre en silencio.
     */
    private fun renewToken(): Boolean {
        val refresh = session.refreshToken ?: return false
        return try {
            val renewed = api.refreshSession(refresh)
            session.accessToken = renewed.accessToken
            session.refreshToken = renewed.refreshToken
            true
        } catch (e: Exception) {
            if (isUnauthorized(e) || isBadRequest(e)) session.clear()
            false
        }
    }

    private fun isBadRequest(e: Exception): Boolean = e.message?.contains("400") == true

    // La app solo RECOGE datos: no baja el catálogo de productos (107k variantes
    // hacían lento el sync y no aportan al escaneo). Solo se cachean los muebles
    // de la tienda, necesarios para reconocer el código del mueble offline.
    private suspend fun pullCatalog() {
        val dao = db.dao()
        val token = session.accessToken ?: return
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
