# Scanner — Honeywell ScanPal EDA52

Equipo confirmado: **Honeywell ScanPal EDA52** (`EDA52-11AE64N21RK`), Android 11/12/13 con el
servicio **Honeywell DataCollection (AIDC)**.

La app no usa el SDK propietario (`.aar`): habla con el lector por la **Intent API** de
DataCollection. Toda la lógica vive en
`mobile/app/src/main/java/com/rack/scanner/HoneywellScannerProvider.kt`, detrás de la interfaz
`ScannerProvider`, por lo que la UI/ViewModel no dependen del modelo.

## Cómo funciona (auto-config, sin tocar cada equipo)

Al entrar a la pantalla de escaneo (`MainActivity` → `DisposableEffect`):

1. **Registrar receiver.** Se registra un `BroadcastReceiver` para la acción propia de la app
   `com.rack.scanner.BARCODE_DATA`. En Android 13+ con `targetSdk=34`, un broadcast emitido por otra
   app (el servicio DataCollection) exige registrar el receiver como **exportado**, por eso usamos
   `ContextCompat.registerReceiver(..., RECEIVER_EXPORTED)`.
2. **Reclamar el scanner (claim).** Se envía un broadcast
   `com.honeywell.aidc.action.ACTION_CLAIM_SCANNER` al paquete `com.intermec.datacollectionservice`
   con:
   - `EXTRA_SCANNER = "dcs.scanner.imager"` (imager interno del EDA52),
   - `EXTRA_PROFILE = "DEFAULT"`,
   - `EXTRA_PROPERTIES` (Bundle) con `DPR_DATA_INTENT = true` y
     `DPR_DATA_INTENT_ACTION = "com.rack.scanner.BARCODE_DATA"`.

   Esto le dice al equipo que, al disparar el gatillo, **entregue la lectura a nuestra app** vía
   intent — sin que nadie configure el perfil DataCollection en Settings de cada dispositivo.
3. **Recibir lecturas.** El código decodificado llega en el extra `data` (claves de respaldo:
   `barcode_string`, `com.honeywell.aidc.EXTRA_BARCODE_DATA`). `extractBarcode()` toma el primer
   valor no vacío y lo entrega a `ScanViewModel.onScan()`.
4. **Liberar (release).** Al salir de la pantalla se envía
   `com.honeywell.aidc.action.ACTION_RELEASE_SCANNER` y se desregistra el receiver, para no dejar el
   scanner tomado.

Todos los valores (acción, profile, scanner id, claves de extra) son parámetros del constructor con
defaults EDA52, de modo que se pueden ajustar sin tocar la lógica ni acoplarse a un firmware.

## Fallback keyboard wedge

`WedgeScannerProvider` cubre desarrollo (emulador) y equipos no Honeywell: el lector emula teclado y
`ScanScreen` captura el texto en un campo, enviando al recibir Enter/Done. No requiere permisos ni el
servicio DataCollection.

## Troubleshooting

- **No llegan lecturas en el EDA52:**
  - Verificá que el servicio **Honeywell DataCollection** esté activo y que el perfil `DEFAULT`
    exista (Settings → Scanning → Internal Scanner). El claim opera sobre ese perfil.
  - Revisá `logcat` filtrando por `com.honeywell` / `datacollection` al disparar el gatillo.
  - Probá temporalmente el **fallback wedge** (campo de captura) para aislar si el problema es la
    Intent API o la app.
- **`SecurityException` al registrar el receiver:** asegurate de usar `ContextCompat.registerReceiver`
  con `RECEIVER_EXPORTED` (ya aplicado); es obligatorio en Android 13+.
- **El scanner queda "tomado" por otra app:** otra app que haya hecho claim sin release puede
  bloquear el imager. Nuestro provider hace release al salir de la pantalla.

## Pruebas

- JVM: `cd mobile && ./gradlew test` ejecuta `HoneywellScannerProviderTest` (parseo de extras) e
  `IsoWeekTest`.
- En equipo real: abrir la app logueado y disparar el gatillo sobre el código de un mueble; debe
  poblar la lectura en `ScanScreen` sin configuración manual previa.
