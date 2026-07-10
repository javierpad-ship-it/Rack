# Guía de desarrollo — cómo evolucionar Rack One

> Todo lo necesario para extender el sistema sin perder congruencia. Ver primero
> `ESTADO_DEL_SISTEMA.md`, `REPORTES_Y_RPC.md` y `LECCIONES_Y_GOTCHAS.md`.

## Entorno remoto (sin PC)

El trabajo es 100% nube: **Railway** (web), **Supabase Cloud** (backend),
**GitHub Actions** (APK). Migraciones vía MCP o el **SQL Editor** del dashboard.
No hay flujo local obligatorio.

## Comandos

```bash
cd web && npm install && npm run dev     # web local (opcional)
cd web && npm test                        # Vitest (parser Excel, semana ISO)
cd web && npm run build                   # valida compilación antes de commitear
cd mobile && ./gradlew test               # tests JVM (IsoWeek, extractBarcode)
cd mobile && ./gradlew assembleDebug      # APK debug
```

## Variables de entorno

**Web (Railway → Variables):**
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY` — cliente.
- `SUPABASE_SERVICE_ROLE_KEY` — solo server-side (Server Actions, `/api/export/floor`).
- `EXPORT_TOKEN` — protege el export nocturno.

**Mobile (Gradle props / `ORG_GRADLE_PROJECT_*` en CI):**
- `SUPABASE_URL`, `SUPABASE_ANON_KEY` — se inyectan en `build.gradle.kts`.
- Firma release: `RACK_UPLOAD_STORE_FILE`, `RACK_UPLOAD_STORE_PASSWORD`,
  `RACK_UPLOAD_KEY_ALIAS`, `RACK_UPLOAD_KEY_PASSWORD`.
- `VERSION_CODE` = `github.run_number + 100` (calculado en el workflow).

**GitHub Actions (secrets):** `SUPABASE_URL`, `SUPABASE_ANON_KEY` y los `RACK_UPLOAD_*`.

## Clientes Supabase en la web (`web/src/lib/supabase/`)

- `client.ts` — navegador (anon key, respeta RLS).
- `server.ts` — Server Components / middleware (cookies del usuario).
- `admin.ts` — **service-role** (bypassa RLS). Solo desde Server Actions o route
  handlers, nunca expuesto al cliente.
- `middleware.ts` — refresca sesión y protege rutas.

## Receta: agregar un reporte nuevo (RPC → página)

1. **SQL**: nueva migración `supabase/migrations/00NN_nombre.sql` con una función
   `returns json` `security definer set search_path = public, pg_temp`. Empezá con
   el gate de rol:
   ```sql
   if current_role_name() not in ('admin','analista') then
     p_store := current_store_id();
     if p_store is null then raise exception 'Sin tienda asignada'; end if;
   end if;
   ```
   - Si cruza escaneo con stock/venta, envolvé el SKU del escaneo en `norm_sku()`.
   - Para exports (muchas filas) devolvé **un JSON** (`json_agg`), no `returns table`
     (límite 1000 de PostgREST — gotcha #4).
   - `grant execute … to authenticated;` (o solo service-role si es sensible).
2. **Aplicar**: `apply_migration` por MCP, o pegar en el SQL Editor. Si cambia el
   tipo de retorno de una función existente, `drop function` primero.
3. **Web**: página cliente en `web/src/app/(dashboard)/<ruta>/page.tsx` que llama
   `supabase.rpc('<fn>', { … })`. Sumá la entrada al nav en `layout.tsx` con el rol.
4. **Congruencia**: actualizá `REPORTES_Y_RPC.md` y la tabla de rutas de
   `ESTADO_DEL_SISTEMA.md`.

## Receta: nuevos campos en el import

- El parser vive en `web/src/lib/import/parseExcel.ts` (con tests en
  `parseExcel.test.ts`). Encabezados se normalizan (minúsculas/sin acentos) y las
  columnas se resuelven por alias (`pick([...])`).
- SKU siempre por `normSku()`. Fechas siempre por `normalizeDate()` con el libro
  leído en `raw: true` (gotcha #3).
- Cargas masivas: agregar en el navegador y subir por lotes (`appendSalesDaily` /
  `appendStockSnapshot`), recompute una sola vez (gotcha #8).

## Convenciones

- **UI en español** (operarios/encargados).
- **Semáforo IRP**: verde ≥ 30, naranja 20–30, rojo < 20 (helpers `irpText`/`irpCell`).
- Fila **TOTAL** (`tfoot`) en tablas de reportes; IRP/margen recalculados sobre
  agregados, no promediados.
- Autorización en **RLS**; el cliente solo filtra por UX.
- Operaciones masivas/admin con **service-role** desde Server Actions.
- Commits en rama de trabajo; no crear PRs salvo pedido explícito.

## Mobile (resumen)

- Kotlin + Compose. Dos flavors: **Inventario** (`com.geeksapp.rackone`) y **Repo**
  (`…​.repo`). Room offline + `SyncWorker` (WorkManager) idempotente por `client_uid`,
  con refresh de token al 401. Scanner EDA52 vía Intent API (`docs/SCANNER_EDA52.md`).
- El escaneo NO baja catálogo (solo recoge datos). El SKU se guarda tal cual llega
  (con ceros) y se normaliza al leer en los reportes — **no** poner triggers de
  escritura sobre `scan_lines` (gotcha #2).
- APK por GitHub Actions (`android-release.yml`); `compileSdk/targetSdk 35`, AGP 8.6.

## Antes de commitear

1. `npm run build` (web) o `./gradlew test` (mobile) verde.
2. Si tocaste SQL, aplicá la migración y verificá con un `execute_sql`.
3. Actualizá los docs afectados (índice / catálogo / gotchas).
