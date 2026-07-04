package com.rack.ui

import android.app.Application
import android.media.AudioManager
import android.media.ToneGenerator
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.rack.AppMode
import com.rack.data.FixtureEntity
import com.rack.data.RackDatabase
import com.rack.data.ScanLineEntity
import com.rack.data.ScanSessionEntity
import com.rack.data.PendingSessionSummary
import com.rack.net.SessionStore
import com.rack.sync.SyncScheduler
import com.rack.util.IsoWeek
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.util.UUID

data class ScanLineUi(val sku: String, val name: String, val quantity: Int)

data class ScanUiState(
    val fixture: FixtureEntity? = null,
    val lines: List<ScanLineUi> = emptyList(),
    val message: String? = null,
    val pendingCount: Int = 0,
    // Si el mueble ya tiene conteo esta semana, cantidad de ítems del conteo
    // anterior; mientras no sea null, la UI muestra el diálogo Sumar/Reiniciar.
    val priorPrompt: Int? = null,
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

    /** Sesiones locales sin sincronizar (para el menú). Se vacían solas al subir. */
    val pending: StateFlow<List<PendingSessionSummary>> =
        db.dao().pendingSessionSummaries()
            .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val counts = linkedMapOf<String, Int>()
    private val names = mutableMapOf<String, String>()
    // Líneas del conteo anterior de esta semana, en espera de Sumar/Reiniciar.
    private var pendingPrior: List<ScanLineEntity> = emptyList()

    // Feedback sonoro del escaneo (beep = ok, tono grave = error).
    private val tone: ToneGenerator? = try {
        ToneGenerator(AudioManager.STREAM_MUSIC, 85)
    } catch (e: Exception) {
        null
    }

    private fun beepOk() {
        try { tone?.startTone(ToneGenerator.TONE_PROP_BEEP, 120) } catch (_: Exception) {}
    }

    private fun beepError() {
        try { tone?.startTone(ToneGenerator.TONE_SUP_ERROR, 250) } catch (_: Exception) {}
    }

    override fun onCleared() {
        try { tone?.release() } catch (_: Exception) {}
        super.onCleared()
    }

    init {
        refreshPending()
    }

    fun onScan(code: String) {
        // Mientras esté el diálogo Sumar/Reiniciar, no procesar lecturas.
        if (_state.value.priorPrompt != null) {
            setMessage("Elegí Sumar o Reiniciar antes de seguir escaneando")
            return
        }
        viewModelScope.launch {
            if (_state.value.fixture == null) {
                val fixture = db.dao().findFixtureByBarcode(code)
                if (fixture == null) {
                    beepError()
                    setMessage("Mueble no reconocido: $code")
                } else if (AppMode.isAudit) {
                    // Inventario: ¿ya hay un conteo de este mueble esta semana en este equipo?
                    val prior = db.dao().lastSessionFor(fixture.id, IsoWeek.of())
                    val priorLines = if (prior != null) db.dao().linesForSession(prior.clientUid) else emptyList()
                    if (priorLines.isNotEmpty()) {
                        beepOk()
                        pendingPrior = priorLines
                        _state.value = _state.value.copy(
                            fixture = fixture,
                            priorPrompt = priorLines.size,
                            message = "Este mueble ya fue escaneado esta semana.",
                        )
                    } else {
                        beepOk()
                        _state.value = _state.value.copy(fixture = fixture, message = "Mueble: ${fixture.name}")
                    }
                } else {
                    // Repo: siempre suma, nunca pregunta.
                    beepOk()
                    _state.value = _state.value.copy(fixture = fixture, message = "Reponiendo: ${fixture.name}")
                }
            } else {
                addProduct(code)
            }
        }
    }

    /** El operario elige SUMAR: precarga el conteo anterior y sigue agregando. */
    fun continueAdding() {
        viewModelScope.launch {
            pendingPrior.forEach { line ->
                names[line.sku] = line.sku
                counts[line.sku] = (counts[line.sku] ?: 0) + line.quantity
            }
            pendingPrior = emptyList()
            _state.value = _state.value.copy(priorPrompt = null, message = "Sumando al conteo anterior")
            emitLines(null)
        }
    }

    /** El operario elige REINICIAR: empieza el conteo de cero. */
    fun restartCount() {
        pendingPrior = emptyList()
        counts.clear()
        names.clear()
        _state.value = _state.value.copy(priorPrompt = null, message = "Conteo reiniciado")
        emitLines(null)
    }

    private suspend fun addProduct(code: String) {
        // Solo se recoge el dato: el código escaneado ES el SKU/variante.
        // Los nombres se resuelven en la web; sin catálogo local el escaneo
        // es inmediato y el sync liviano.
        val sku = code
        names[sku] = sku
        counts[sku] = (counts[sku] ?: 0) + 1
        beepOk()
        emitLines("Sumado: $sku (x${counts[sku]})")
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
                kind = AppMode.kind,
            )
            val lines = counts.map { (sku, qty) -> ScanLineEntity(uid, sku, qty) }
            db.dao().saveScan(sessionEntity, lines)
            SyncScheduler.syncNow(getApplication())
            reset()
            setMessage("✓ Guardado. Se enviará automáticamente al haber señal.")
            refreshPending()
        }
    }

    fun reset() {
        counts.clear()
        names.clear()
        pendingPrior = emptyList()
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
