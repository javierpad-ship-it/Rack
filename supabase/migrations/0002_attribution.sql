-- ============================================================================
-- Rack — Atribución de ventas a muebles + métricas
-- ============================================================================

-- Devuelve el ISO week ('IYYY-"W"IW') de una fecha. Punto único de la
-- definición de "semana" (revisable a semana comercial).
create or replace function iso_week(p_ts timestamptz)
returns text language sql immutable as $$
  select to_char(p_ts, 'IYYY-"W"IW');
$$;

-- ----------------------------------------------------------------------------
-- attribute_sales(store, week)
-- Adjudica cada venta (store, sku, week) al PRIMER mueble (por scanned_at) que
-- contenga ese SKU esa semana. SKU sin match => fixture_id NULL ("sin mueble").
-- Idempotente: reemplaza la atribución de esa (tienda, semana).
-- ----------------------------------------------------------------------------
create or replace function attribute_sales(p_store_id uuid, p_week text)
returns integer language plpgsql security definer as $$
declare
  v_rows integer;
begin
  delete from sales_attribution where store_id = p_store_id and week = p_week;

  with first_fixture as (
    -- primer mueble que escaneó cada SKU esa semana/tienda
    select distinct on (sl.sku)
           sl.sku,
           ss.fixture_id,
           ss.scanned_at
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id
      and ss.week = p_week
      and sl.quantity > 0
    order by sl.sku, ss.scanned_at asc, ss.id asc
  )
  insert into sales_attribution (store_id, fixture_id, sku, week, units, amount)
  select s.store_id, ff.fixture_id, s.sku, s.week, s.units, s.amount
  from sales s
  left join first_fixture ff on ff.sku = s.sku
  where s.store_id = p_store_id and s.week = p_week;

  get diagnostics v_rows = row_count;

  perform recalc_fixture_metrics(p_store_id, p_week);
  return v_rows;
end $$;

-- ----------------------------------------------------------------------------
-- recalc_fixture_metrics(store, week)
-- Recalcula weekly_fixture_metrics: venta por mueble, stock expuesto y rotación.
-- ----------------------------------------------------------------------------
create or replace function recalc_fixture_metrics(p_store_id uuid, p_week text)
returns void language plpgsql security definer as $$
begin
  delete from weekly_fixture_metrics where store_id = p_store_id and week = p_week;

  with exposed as (
    -- stock expuesto por mueble = suma de cantidades escaneadas esa semana
    select ss.fixture_id, sum(sl.quantity)::int as exposed_units
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id and ss.week = p_week
    group by ss.fixture_id
  ),
  sold as (
    select fixture_id,
           sum(units)::int   as units_sold,
           sum(amount)       as amount_sold
    from sales_attribution
    where store_id = p_store_id and week = p_week and fixture_id is not null
    group by fixture_id
  )
  insert into weekly_fixture_metrics
    (store_id, fixture_id, week, units_sold, amount_sold, exposed_units, rotation)
  select
    p_store_id,
    f.id,
    p_week,
    coalesce(sold.units_sold, 0),
    coalesce(sold.amount_sold, 0),
    coalesce(exposed.exposed_units, 0),
    case when coalesce(exposed.exposed_units, 0) > 0
         then round(coalesce(sold.units_sold, 0)::numeric / exposed.exposed_units, 4)
         else null end
  from fixtures f
  left join exposed on exposed.fixture_id = f.id
  left join sold    on sold.fixture_id = f.id
  where f.store_id = p_store_id
    and (exposed.fixture_id is not null or sold.fixture_id is not null);
end $$;

-- ----------------------------------------------------------------------------
-- store_warehouse(store, week): almacén deducido por SKU
-- almacén = stock total de la tienda − unidades escaneadas en piso.
-- Vista de función (no materializa): se consulta on-demand desde la web.
-- ----------------------------------------------------------------------------
create or replace function store_warehouse(p_store_id uuid, p_week text)
returns table (sku text, total_units int, floor_units int, warehouse_units int)
language sql stable security definer as $$
  with floor as (
    select sl.sku, sum(sl.quantity)::int as floor_units
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id and ss.week = p_week
    group by sl.sku
  )
  select
    st.sku,
    st.total_units,
    coalesce(f.floor_units, 0) as floor_units,
    greatest(st.total_units - coalesce(f.floor_units, 0), 0) as warehouse_units
  from store_stock st
  left join floor f on f.sku = st.sku
  where st.store_id = p_store_id and st.week = p_week;
$$;

-- ----------------------------------------------------------------------------
-- Comparativa semana a semana de venta por mueble (para reportes).
-- ----------------------------------------------------------------------------
create or replace function fixture_week_over_week(p_store_id uuid, p_week text, p_prev_week text)
returns table (
  fixture_id uuid,
  fixture_name text,
  units_now int,
  units_prev int,
  amount_now numeric,
  amount_prev numeric,
  delta_units int,
  delta_pct numeric
) language sql stable security definer as $$
  select
    f.id,
    f.name,
    coalesce(cur.units_sold, 0),
    coalesce(prev.units_sold, 0),
    coalesce(cur.amount_sold, 0),
    coalesce(prev.amount_sold, 0),
    coalesce(cur.units_sold, 0) - coalesce(prev.units_sold, 0),
    case when coalesce(prev.units_sold, 0) > 0
         then round((coalesce(cur.units_sold,0) - prev.units_sold)::numeric
                    / prev.units_sold * 100, 1)
         else null end
  from fixtures f
  left join weekly_fixture_metrics cur
    on cur.fixture_id = f.id and cur.week = p_week
  left join weekly_fixture_metrics prev
    on prev.fixture_id = f.id and prev.week = p_prev_week
  where f.store_id = p_store_id
  order by coalesce(cur.amount_sold, 0) desc;
$$;
