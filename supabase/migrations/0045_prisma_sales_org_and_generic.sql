-- ============================================================================
-- 0045 — Prisma: Org. de Ventas por tienda + código genérico en los hechos
--
-- Prisma (app de consulta/propuesta de precios) necesita dos cosas que Rack One
-- aún no modela:
--   1) La **Org. de Ventas** (R050 / R040) de cada tienda. El PVP puede diferir
--      por Org (se puede rebajar en una cadena y no en la otra), así que el
--      historial de precios (0046) va por (genérico, Org) y la Org sale de la
--      tienda donde nace la propuesta.
--   2) El **CODIGO_GENERICO** (Material) a nivel de los hechos. Hoy solo existe
--      `article_code` (CODIGO_ARTICULO) y `sku` (CODIGO_VARIANTE). El PVP vive a
--      nivel genérico, por eso hace falta cruzar variante → genérico.
-- ============================================================================

-- Org. de Ventas de la tienda (R050 / R040). Null = sin asignar todavía.
alter table stores add column if not exists sales_org text;
comment on column stores.sales_org is 'Org. de Ventas SAP: R050 / R040';

-- CODIGO_GENERICO (Material) en las tablas de hechos por variante.
alter table stock_current   add column if not exists generic_code text;
alter table sales_daily     add column if not exists generic_code text;
alter table stock_snapshots add column if not exists generic_code text;

create index if not exists stock_current_generic_idx   on stock_current(generic_code);
create index if not exists sales_daily_generic_idx      on sales_daily(generic_code);
create index if not exists stock_snapshots_generic_idx  on stock_snapshots(generic_code);

-- Resuelve el CODIGO_GENERICO de una variante (SKU). Prioriza la foto de stock
-- vigente; cae a ventas y a la última foto dateada. Devuelve null si no cruza.
create or replace function generic_of_sku(p_sku text)
returns text language sql stable as $$
  select generic_code from (
    select generic_code, 1 as pr from stock_current  where sku = p_sku and generic_code is not null
    union all
    select generic_code, 2      from sales_daily      where sku = p_sku and generic_code is not null
    union all
    select generic_code, 3      from stock_snapshots  where sku = p_sku and generic_code is not null
  ) t
  order by pr
  limit 1;
$$;
