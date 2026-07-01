# Rack — App Android (Honeywell)

App de campo para el escaneo semanal de muebles. Kotlin + Jetpack Compose, **offline-first**
(Room) con sincronización a Supabase (WorkManager).

Un solo código, **dos apps** (Gradle product flavors, dimension `app`):
- **Rack One - Inventario** (`inventario`, `applicationId com.geeksapp.rackone`, `APP_KIND=audit`) —
  conteo completo del mueble. Re-escanear el mismo mueble en la semana pregunta **Sumar/Reiniciar**
  y el resultado reemplaza el conteo anterior (es la foto definitiva de esa auditoría).
- **Rack One - Repo** (`repo`, `applicationId com.geeksapp.rackone.repo`, `APP_KIND=restock`) —
  reposición incremental (escanear el mueble + 1-2 productos). Nunca pregunta, siempre **suma** por
  encima de la última auditoría; no cuenta como "mueble auditado" en Cobertura.

Ver `com.rack.AppMode` (lee `BuildConfig.APP_KIND`) y `ScanViewModel` (gating del diálogo por modo).

## Setup

```bash
cd mobile
# Configurar credenciales en local.properties (no se commitea):
#   SUPABASE_URL=https://<ref>.supabase.co
#   SUPABASE_ANON_KEY=<anon-key>
./gradlew assembleDebug   # compila ambos flavors: assembleInventarioDebug + assembleRepoDebug
```

APKs resultantes:
- `app/build/outputs/apk/inventario/debug/app-inventario-debug.apk`
- `app/build/outputs/apk/repo/debug/app-repo-debug.apk`

> Falta el wrapper de Gradle (`gradlew`/`gradle/wrapper`). Generarlo una vez con
> `gradle wrapper --gradle-version 8.7` en un entorno con Gradle instalado.

## Arquitectura
- `scanner/` — `ScannerProvider` (abstracción) + Honeywell (intents) y wedge (fallback).
- `data/` — Room: entidades, DAO, base (`rack.db`).
- `net/` — cliente REST a Supabase (Auth + PostgREST) y `SessionStore`.
- `sync/` — `SyncWorker` + `SyncScheduler` (push idempotente por `client_uid`, pull de catálogo/muebles).
- `ui/` — Compose: `LoginScreen`, `ScanScreen`, `ScanViewModel`, `MainActivity`.
- `util/IsoWeek` — semana ISO (espejo de web/SQL).

## Flujo de escaneo
1. Escanear código del **mueble** → abre la sesión.
2. Escanear productos (SKU/EAN) → suma cantidades; ajustables con +/−.
3. **Guardar** → persiste en Room y dispara sync (sube cuando hay red).

## Scanner Honeywell
La acción de intent y las claves de extra están en `HoneywellScannerProvider` y se ajustan al
modelo del equipo configurando el perfil **Intent** del DataCollection. Sin esa config, usar el
campo de captura (modo wedge).
