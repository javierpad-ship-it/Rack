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
- [ ] Login (Supabase Auth).
- [ ] Escaneo de mueble + conteo de cantidades por SKU.
- [ ] Persistencia offline (Room).
- [ ] Sincronización (WorkManager).
- [ ] Integración scanner Honeywell (intents) + fallback wedge.

**Backend**
- [x] `attribute_sales` (regla "primer mueble").
- [x] `recalc_store_warehouse` (almacén deducido).
- [ ] Disparo de atribución tras import de ventas.

## Fase 2 — Automatización / analítica
- [ ] Integración API POS/ERP (ventas, stock, catálogo).
- [ ] Deducción automática de almacén.
- [ ] Analítica avanzada: rotación, alertas, tendencias.

## Pendientes funcionales a confirmar
- Formato/columnas de los Excel (catálogo, ventas, stock total).
- Definición de "semana" (ISO vs comercial).
- Modelo Honeywell final (fija `ScannerProvider`).
