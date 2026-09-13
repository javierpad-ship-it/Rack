# Arquitectura

## Visión general

```
┌──────────────────────┐         ┌──────────────────────┐
│  App Android (Kotlin) │  REST   │      Supabase         │
│  - Honeywell scanner  │◀───────▶│  - PostgreSQL         │
│  - Room (offline DB)  │  sync   │  - Auth (roles)       │
│  - Sync worker        │         │  - Storage (planos)   │
└──────────────────────┘         │  - RPC / funciones SQL│
                                  │    (atribución)       │
┌──────────────────────┐  REST   │                       │
│  Web admin (Next.js)  │◀───────▶│                       │
│  - Import Excel        │         └──────────────────────┘
│  - CRUD + plano/pines  │
│  - Reportes + heatmap  │
└──────────────────────┘
```

Backend "serverless": no hay servidor propio. Toda la lógica vive en PostgreSQL (funciones SQL/RPC)
y en las apps cliente. Supabase aporta DB gestionada, Auth con roles, Storage y RLS.

## Modelo de datos

Ver `supabase/migrations/0001_init.sql`. Tablas principales:

- `stores` — tiendas.
- `profiles` — usuario ↔ rol ↔ tienda (extiende `auth.users`).
- `products` — catálogo maestro (sku, ean, familia/categoría).
- `fixtures` — muebles: barcode + posición (`pin_x`, `pin_y`) en el plano.
- `store_layouts` — imagen del plano por tienda.
- `scan_sessions` / `scan_lines` — escaneo semanal (mueble → SKU + cantidad).
- `sales` — ventas importadas por (tienda, sku, semana).
- `store_stock` — stock total por tienda y semana (para deducir almacén).
- `sales_attribution` — venta adjudicada a cada mueble.
- `weekly_fixture_metrics` — agregado por mueble/semana (venta, stock expuesto, rotación).
- `import_logs` — trazabilidad de importaciones.

## Semana

Se usa **ISO week** representada como texto `IIII-WNN` (ej. `2026-W26`), calculada con
`to_char(fecha, 'IYYY-"W"IW')`. Decisión revisable a "semana comercial" si el negocio lo requiere.

## Lógica de atribución

Implementada originalmente en `supabase/migrations/0002_attribution.sql`; semántica vigente en
`0070_piso_integridad_y_atribucion.sql` como `attribute_sales(p_store_id, p_week)`:

1. Por cada `sales(sku)` de esa tienda/semana (SKU normalizado con `norm_sku`), ubicar el mueble:
   si el SKU se escaneó **esa semana**, el **primer** `scan_session` de la semana (orden
   `scanned_at`); si no, el **último** `scan_session` (auditoría o reposición) de cualquier semana
   anterior donde apareció el SKU. El ALMACÉN nunca es candidato. (La regla "solo misma semana"
   dejaba casi todas las ventas sin mueble con auditoría mensual — gotcha #13.)
2. Insertar/reemplazar filas en `sales_attribution`.
3. Recalcular `weekly_fixture_metrics` (venta por mueble, stock expuesto, rotación).

El piso "ahora" lo da `fixture_floor_vigente(p_store_id)` (`0065`/`0070`): último audit del mueble
+ reposiciones posteriores − ventas atribuidas en semanas posteriores − reposiciones al ALMACÉN.
Solo cuenta muebles existentes (`scan_sessions.fixture_id` tiene FK `ON DELETE RESTRICT`).

`recalc_store_warehouse(p_store_id, p_week)` deduce el almacén:
`store_stock.total_units − Σ scan_lines.cantidad del piso`.

## Proyección mensual

Vista mensual proyectada (además de la semanal). En `supabase/migrations/0010_monthly.sql`,
`fixture_monthly_metrics(p_store_id, p_month)`:

- **Semana → mes:** una semana pertenece al mes de su **jueves ISO** (`iso_week_thursday()`).
- **Atribución:** la venta del mes de un SKU va al **último mueble escaneado** del mes (mayor `scanned_at`).
- **Stock expuesto:** el del **último escaneo** del mes por mueble (informativo).
- **Proyección lineal por días corridos:** `proyectado = mtd × días_del_mes / días_transcurridos`.
  Mes en curso → días hasta hoy; mes pasado → mes completo.
- **Rotación proyectada** = unidades proyectadas / **stock total (piso + almacén)** de los SKUs del mueble
  (`store_stock` de la semana más reciente del mes; sin doble conteo gracias a la atribución último-mueble).

La ingesta diaria (Fase 2) solo refresca la venta de la semana en curso; la proyección se recalcula on-demand.

## Seguridad (RLS)

- `admin` y `analista`: todas las tiendas (analista solo lectura).
- `visual`, `encargado`, `operario`: solo su `store_id`.
- Escritura de escaneos: `operario`/`visual`/`encargado` sobre su tienda.

## App Android — offline-first

- `Room` espeja: catálogo de la tienda, muebles, y sesiones/líneas pendientes de sync.
- `SyncWorker` (WorkManager) empuja sesiones pendientes vía REST y baja catálogo/muebles actualizados.
- Escaneo abstraído tras `ScannerProvider`. Equipo confirmado: **Honeywell ScanPal EDA52**;
  `HoneywellScannerProvider` usa la Intent API de DataCollection con **auto-config (claim/release)** —
  reclama el imager y redirige las lecturas a la acción propia de la app, sin configurar cada equipo.
  Fallback **keyboard wedge** para desarrollo/equipos no Honeywell. Detalle en `docs/SCANNER_EDA52.md`.
