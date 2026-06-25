# Roadmap

## Fase 0 — Setup (en curso)
- [x] Estructura del repositorio y documentación.
- [x] Esquema PostgreSQL + RLS (`supabase/migrations/0001_init.sql`).
- [x] Lógica de atribución y métricas (`supabase/migrations/0002_attribution.sql`).
- [ ] Proyecto Supabase creado + migraciones aplicadas.
- [ ] Auth/roles configurados.

## Fase 1 — MVP
**Web**
- [x] Cliente Supabase + login por rol (middleware + dashboard).
- [x] Import Excel: catálogo, ventas, stock total (con `import_logs`) + disparo de atribución.
- [x] CRUD tiendas / muebles / usuarios.
- [x] Subir plano + ubicar pines (rol Visual). Storage bucket `layouts` (`0003_storage.sql`).
- [x] Reportes: venta por mueble, comparativa semana a semana (+ almacén deducido).
- [x] Heatmap sobre el plano.

**App Android**
- [x] Andamiaje Gradle (Compose, Room, WorkManager, OkHttp).
- [x] Persistencia offline (Room): entidades, DAO, base.
- [x] Integración scanner Honeywell (intents) + fallback wedge (`ScannerProvider`).
- [x] Utilidad de semana ISO (espejo de web/SQL) + test.
- [x] Cliente REST a Supabase (Auth + PostgREST) y SessionStore.
- [x] Sincronización offline (SyncWorker + SyncScheduler, idempotente por client_uid).
- [x] Login (Supabase Auth) — UI Compose.
- [x] Escaneo de mueble + conteo de cantidades por SKU (UI Compose).

**Backend**
- [x] `attribute_sales` (regla "primer mueble").
- [x] `recalc_store_warehouse` (almacén deducido).
- [ ] Disparo de atribución tras import de ventas.

**Tests / calidad (post Fase 1)**
- [x] Tests del parser de Excel (`web/src/lib/import/parseExcel.test.ts`).
- [x] Test de semana ISO en web y Android.
- [x] Test SQL de atribución + rotación + almacén (`supabase/tests/attribution_test.sql`).
- [x] Guía de despliegue (`docs/DEPLOY.md`).
- [x] CI básica de tests de la web (`.github/workflows/ci.yml`).
- [x] Datos de demo (`supabase/seed.sql`).
- [x] Cobertura de escaneo semanal (`scan_coverage()` + `/coverage`).
- [x] Reporte de ventas sin mueble (`unattributed_sales()` + pestaña en Reportes).
- [x] Dashboard con cobertura de escaneo por tienda (barras de avance).
- [x] App: botón de sincronización manual + contador de pendientes.
- [x] Guía de usuario por rol (`docs/GUIA_USUARIO.md`).

## Fase 2 — Automatización / analítica
Diseño detallado en `docs/FASE2_DISENO.md`.
- [x] Alias de producto (`product_aliases` + `resolve_sku()`) + resolución en import de ventas.
- [ ] Staging + adaptador de ingesta del POS/ERP (pull programado).
- [ ] Integración API POS/ERP (ventas, stock, catálogo).
- [ ] Deducción automática de almacén.
- [ ] Analítica avanzada: rotación, alertas, tendencias.

## Pendientes funcionales a confirmar
- Formato/columnas de los Excel (catálogo, ventas, stock total).
- Definición de "semana" (ISO vs comercial).
- Modelo Honeywell final (fija `ScannerProvider`).
