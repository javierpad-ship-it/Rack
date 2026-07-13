-- ============================================================================
-- 0067 — Heatmap por venta de los últimos 7 días (no de la semana comercial)
--
-- El heatmap del reporte usaba weekly_fixture_metrics (semana comercial
-- completa), que no coincide con "últimos 7 días" cuando la fecha actual no
-- cae al final de la semana. fixture_last7_sales() calcula venta atribuida a
-- cada mueble para la ventana [hoy-6, hoy], reusando la misma regla de
-- atribución que attribute_sales() ("primer mueble escaneado esa semana"),
-- aplicada semana a semana sobre las fechas que caen dentro de la ventana
-- (la ventana puede cruzar el borde de dos semanas comerciales).
-- ============================================================================

create or replace function fixture_last7_sales(p_store_id uuid)
returns table (fixture_id uuid, fixture_name text, units int, amount numeric)
language sql stable security definer set search_path = public, pg_temp as $$
  with days as (
    select sd.sku, sd.units, sd.amount, comm_week(sd.sale_date) as week
    from sales_daily sd
    where sd.store_id = p_store_id
      and sd.sale_date between current_date - 6 and current_date
  ),
  first_fixture as (
    select distinct on (sl.sku, ss.week)
      sl.sku, ss.week, ss.fixture_id
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id
      and ss.week in (select distinct week from days)
      and sl.quantity > 0
    order by sl.sku, ss.week, ss.scanned_at asc, ss.id asc
  ),
  attributed as (
    select ff.fixture_id, d.units, d.amount
    from days d
    left join first_fixture ff on ff.sku = d.sku and ff.week = d.week
  ),
  agg as (
    select fixture_id, sum(units)::int as units_sold, sum(amount) as amount_sold
    from attributed
    where fixture_id is not null
    group by fixture_id
  )
  select f.id, f.name, coalesce(a.units_sold, 0), coalesce(a.amount_sold, 0)
  from fixtures f
  left join agg a on a.fixture_id = f.id
  where f.store_id = p_store_id;
$$;

revoke all on function fixture_last7_sales(uuid) from public;
grant execute on function fixture_last7_sales(uuid) to authenticated;
