-- ============================================================================
-- Rack — Reporte de ventas no atribuidas ("sin mueble")
-- SKUs vendidos esa semana que no fueron escaneados en ningún mueble.
-- Útil para detectar muebles sin escanear o productos fuera de exhibición.
-- ============================================================================

create or replace function unattributed_sales(p_store_id uuid, p_week text)
returns table (sku text, name text, units int, amount numeric)
language sql stable security definer as $$
  select
    sa.sku,
    coalesce(p.name, '(sin catálogo)') as name,
    sa.units,
    sa.amount
  from sales_attribution sa
  left join products p on p.sku = sa.sku
  where sa.store_id = p_store_id
    and sa.week = p_week
    and sa.fixture_id is null
  order by sa.amount desc;
$$;
