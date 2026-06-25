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

Implementada en `supabase/migrations/0002_attribution.sql` como
`attribute_sales(p_store_id, p_week)`:

1. Por cada `sales(sku)` de esa tienda/semana, ubicar el **primer** `scan_session`
   (orden `scanned_at`) que contenga ese SKU → ese es el mueble adjudicado.
2. Insertar/reemplazar filas en `sales_attribution`.
3. Recalcular `weekly_fixture_metrics` (venta por mueble, stock expuesto, rotación).

`recalc_store_warehouse(p_store_id, p_week)` deduce el almacén:
`store_stock.total_units − Σ scan_lines.cantidad del piso`.

## Seguridad (RLS)

- `admin` y `analista`: todas las tiendas (analista solo lectura).
- `visual`, `encargado`, `operario`: solo su `store_id`.
- Escritura de escaneos: `operario`/`visual`/`encargado` sobre su tienda.

## App Android — offline-first

- `Room` espeja: catálogo de la tienda, muebles, y sesiones/líneas pendientes de sync.
- `SyncWorker` (WorkManager) empuja sesiones pendientes vía REST y baja catálogo/muebles actualizados.
- Escaneo abstraído tras `ScannerProvider`; implementación Honeywell por intents + fallback wedge.
