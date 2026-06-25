# Cuestionario para resolver (decisiones tomadas con default durante el trabajo autónomo)

> Cada ítem se construyó con un **default razonable** para no frenar. Revisá y corregí lo que haga falta;
> luego ajusto el código.

## Abiertas desde el inicio
1. **Formato de los Excel** (catálogo, ventas, stock total): ¿qué columnas y nombres exactos?
   - _Default asumido:_ ver `docs/FORMATOS_IMPORT.md`.
2. **Definición de "semana"**: ¿ISO week o semana comercial (qué día empieza)?
   - _Default asumido:_ ISO week (`iso_week()` en `0002_attribution.sql`).
3. **Modelo Honeywell y versión de Android**: define la implementación final del scanner.
   - _Default asumido:_ integración por Honeywell DataCollection intents + fallback keyboard wedge.

## Decisiones tomadas durante el loop nocturno
<!-- El loop agrega aquí cada default que eligió, con fecha y archivo afectado. -->

- **2026-06-25** — Coordenadas de pines del mueble en el plano: se usan **normalizadas [0..1]**
  (independientes del tamaño de imagen). Archivo: `supabase/migrations/0001_init.sql` (`fixtures.pin_x/pin_y`).
- **2026-06-25** — Columnas aceptadas en los Excel: el parser admite varios alias por columna
  (ver `docs/FORMATOS_IMPORT.md`). Confirmar nombres reales del POS/ERP. Archivo: `web/src/lib/import/parseExcel.ts`.
- **2026-06-25** — Auth: login por **email/contraseña** de Supabase Auth (sin SSO). Archivo: `web/src/app/login/page.tsx`.
- **2026-06-25** — Import masivo se ejecuta con **service-role** desde Server Actions (solo rol admin). Archivo: `web/src/app/(dashboard)/import/actions.ts`.
- **2026-06-25** — Plano: bucket de Storage **`layouts` público** (lectura), escritura admin/visual. El pin se
  ubica con **clic sobre la imagen** (coordenadas normalizadas). Archivos: `supabase/migrations/0003_storage.sql`,
  `web/src/app/(dashboard)/layout/page.tsx`.
- **2026-06-25** — Android: `minSdk = 24` (Android 7+) para cubrir equipos Honeywell antiguos. Archivo:
  `mobile/app/build.gradle.kts`.
- **2026-06-25** — Scanner Honeywell: acción de intent por defecto `com.honeywell.sample.action.BARCODE_DATA`
  y claves de extra habituales; **se ajusta al confirmar el modelo** configurando el perfil Intent del equipo.
  Archivo: `mobile/app/src/main/java/com/rack/scanner/HoneywellScannerProvider.kt`.
- **2026-06-25** — App: el operario escanea **un mueble por sesión**; el conteo es por incremento (+1 por
  lectura) y editable con +/−. La resolución de producto acepta **SKU o EAN** contra el catálogo cacheado.
  Archivo: `mobile/app/src/main/java/com/rack/ui/ScanViewModel.kt`.
- **2026-06-25** — Falta generar el **Gradle wrapper** (`gradlew`) en un entorno con Gradle; ver `mobile/README.md`.
- **2026-06-25** — Fase 2: los **alias de producto** se resuelven en el **import de ventas** (no en `attribute_sales`),
  agregando duplicados que colapsan al mismo SKU. Confirmar reglas de alias del POS. Archivos:
  `supabase/migrations/0006_product_aliases.sql`, `web/src/app/(dashboard)/import/actions.ts`.
- **2026-06-25** — Fase 2: el adaptador POS es una **plantilla genérica** (`supabase/functions/ingest-sales`);
  el mapeo real (endpoint, auth, formato de respuesta) se completa al conocer el POS del cliente.
- **2026-06-25** — Proyección mensual: una semana se asigna al mes de su **jueves ISO**
  (`iso_week_thursday`); proyección **lineal por días corridos**; atribución por **último mueble**;
  stock expuesto del **último escaneo** del mes. Confirmar si la "semana comercial" cambiaría este anclaje.
  Archivos: `supabase/migrations/0010_monthly.sql`, `web/src/app/(dashboard)/monthly/page.tsx`.
- **Ingesta diaria confirmada** por el usuario; queda programar el job (pg_cron) al conectar el POS.
- **2026-06-25** — Rotación mensual proyectada: se mide contra **stock total (piso + almacén)** de los SKUs
  del mueble (decisión del usuario), usando `store_stock` de la semana más reciente del mes.
  El "stock expuesto" queda como dato informativo. Archivo: `supabase/migrations/0010_monthly.sql`.
