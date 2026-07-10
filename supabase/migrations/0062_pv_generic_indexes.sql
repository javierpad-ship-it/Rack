-- ============================================================================
-- 0062 — Índices funcionales sobre pv_generic(sku) (bandeja de propuestas lenta)
--
-- price_proposals_review() y prisma_variant_lookup() filtran stock_current /
-- sales_daily / stock_snapshots por pv_generic(sku) = generic_code (0051,
-- 0060), NO por la columna generic_code (que está NULL en casi todas las
-- filas — nunca se pobló por import, ver 0060). Sin índice para esa expresión,
-- cada propuesta dispara ~7 subconsultas que hacen SEQ SCAN de tablas enteras
-- (stock_current/sales_daily tienen decenas de miles de filas) → la bandeja
-- tarda segundos por fila. pv_generic() es IMMUTABLE, así que admite índice
-- de expresión.
-- ============================================================================

-- stock_current: costo_prom/stock_cadena/descripcion/genero/marca (sin store)
-- y stock_tienda (con store) en price_proposals_review; también usado por
-- prisma_variant_lookup (CTE `gen`).
create index if not exists stock_current_pvgeneric_idx
  on stock_current (pv_generic(sku));
create index if not exists stock_current_store_pvgeneric_idx
  on stock_current (store_id, pv_generic(sku));

-- sales_daily: venta_cadena (sin store) y venta_tienda (con store), ambas con
-- filtro adicional de sale_date.
create index if not exists sales_daily_pvgeneric_idx
  on sales_daily (pv_generic(sku), sale_date);
create index if not exists sales_daily_store_pvgeneric_idx
  on sales_daily (store_id, pv_generic(sku), sale_date);

-- stock_snapshots: 'mundo' del genérico (última foto que lo menciona).
create index if not exists stock_snapshots_pvgeneric_idx
  on stock_snapshots (pv_generic(sku), snapshot_date desc);

analyze stock_current;
analyze sales_daily;
analyze stock_snapshots;
