package com.rack.ui

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rack.data.FixtureEntity
import com.rack.data.RackDatabase
import com.rack.data.ScanLineEntity
import com.rack.data.ScanSessionEntity
import com.rack.net.SessionStore
import com.rack.sync.SyncScheduler
import com.rack.util.IsoWeek
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.util.UUID

data class ScanLineUi(val sku: String, val name: String, val quantity: Int)

data class ScanUiState(
    val fixture: FixtureEntity? = null,
    val lines: List<ScanLineUi> = emptyList(),
    val message: String? = null,
    val pendingCount: Int = 0,
)

/**
 * Estado del flujo de escaneo:
 * 1) Primer escaneo = código del mueble -> abre la sesión.
 * 2) Escaneos siguientes = SKU/EAN de productos -> incrementan cantidad.
 * 3) Guardar = persiste sesión + líneas en Room y dispara sync.
 */
class ScanViewModel(app: Application) : AndroidViewModel(app) {
    private val db = RackDatabase.get(app)
    private val session = SessionStore(app)

    private val _state = MutableStateFlow(ScanUiState())
    val state: StateFlow<ScanUiState> = _state.asStateFlow()

    private val counts = linkedMapOf<String, Int>()
    private val names = mutableMapOf<String, String>()

    init {
        refreshPending()
    }

    fun onScan(code: String) {
        viewModelScope.launch {
            if (_state.value.fixture == null) {
                val fixture = db.dao().findFixtureByBarcode(code)
                if (fixture == null) {
                    setMessage("Mueble no reconocido: $code")
                } else {
                    _state.value = _state.value.copy(fixture = fixture, message = "Mueble: ${fixture.name}")
                }
            } else {
                addProduct(code)
            }
        }
    }

    private suspend fun addProduct(code: String) {
        // El código puede ser SKU o EAN; resolvemos contra el catálogo cacheado.
        val product = db.dao().findProduct(code)
        val sku = product?.sku ?: code
        names[sku] = product?.name ?: "(desconocido)"
        counts[sku] = (counts[sku] ?: 0) + 1
        emitLines("Sumado: ${names[sku]} (x${counts[sku]})")
    }

    fun setQuantity(sku: String, qty: Int) {
        if (qty <= 0) counts.remove(sku) else counts[sku] = qty
        emitLines(null)
    }

    private fun emitLines(message: String?) {
        val lines = counts.map { (sku, qty) -> ScanLineUi(sku, names[sku] ?: sku, qty) }
        _state.value = _state.value.copy(lines = lines, message = message)
    }

    fun save() {
        val fixture = _state.value.fixture ?: return
        if (counts.isEmpty()) {
            setMessage("No hay productos para guardar")
            return
        }
        viewModelScope.launch {
            val uid = UUID.randomUUID().toString()
            val now = System.currentTimeMillis()
            val sessionEntity = ScanSessionEntity(
                clientUid = uid,
                storeId = fixture.storeId,
                fixtureId = fixture.id,
                week = IsoWeek.of(),
                scannedAt = now,
                synced = false,
            )
            val lines = counts.map { (sku, qty) -> ScanLineEntity(uid, sku, qty) }
            db.dao().saveScan(sessionEntity, lines)
            SyncScheduler.syncNow(getApplication())
            reset()
            setMessage("Sesión guardada. Sincronizando…")
            refreshPending()
        }
    }

    fun reset() {
        counts.clear()
        names.clear()
        _state.value = ScanUiState(pendingCount = _state.value.pendingCount)
    }

    /** Fuerza una sincronización manual y refresca el contador de pendientes. */
    fun syncNow() {
        SyncScheduler.syncNow(getApplication())
        setMessage("Sincronizando…")
        refreshPending()
    }

    private fun refreshPending() {
        viewModelScope.launch {
            _state.value = _state.value.copy(pendingCount = db.dao().pendingCount())
        }
    }

    private fun setMessage(msg: String) {
        _state.value = _state.value.copy(message = msg)
    }
}
