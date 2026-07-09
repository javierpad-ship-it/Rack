-- ============================================================================
-- 0021 — Piso actual por mueble = escaneado − vendido
--
-- Regla (confirmada): los productos vendidos se restan de la ubicación (mueble).
-- El escaneo es la foto del piso al momento de contar; durante la semana lo
-- vendido de ese mueble reduce lo que queda expuesto. Se agrega
-- weekly_fixture_metrics.remaining_units = max(exposed_units − units_sold, 0)
-- y se recalcula. La deducción de almacén (total − piso) NO cambia: lo vendido
-- salió de la tienda y ya no está ni en piso ni en almacén.
-- ============================================================================

alter table weekly_fixture_metrics
  add column if not exists remaining_units int not null default 0;

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
    (store_id, fixture_id, week, units_sold, amount_sold, exposed_units, remaining_units, rotation)
  select
    p_store_id,
    f.id,
    p_week,
    coalesce(sold.units_sold, 0),
    coalesce(sold.amount_sold, 0),
    coalesce(exposed.exposed_units, 0),
    -- piso actual = expuesto − vendido (nunca negativo)
    greatest(coalesce(exposed.exposed_units, 0) - coalesce(sold.units_sold, 0), 0),
    case when coalesce(exposed.exposed_units, 0) > 0
         then round(coalesce(sold.units_sold, 0)::numeric / exposed.exposed_units, 4)
         else null end
  from fixtures f
  left join exposed on exposed.fixture_id = f.id
  left join sold    on sold.fixture_id = f.id
  where f.store_id = p_store_id
    and (exposed.fixture_id is not null or sold.fixture_id is not null);
end $$;

-- La comparativa por mueble también devuelve el piso actual (semana en curso).
-- Nota: `create or replace` no puede cambiar el tipo de retorno de la versión
-- creada en 0002; hay que dropearla antes para un `db reset` limpio.
drop function if exists fixture_week_over_week(uuid, text, text);
create or replace function fixture_week_over_week(p_store_id uuid, p_week text, p_prev_week text)
returns table (
  fixture_id uuid,
  fixture_name text,
  units_now int,
  units_prev int,
  amount_now numeric,
  amount_prev numeric,
  delta_units int,
  delta_pct numeric,
  exposed_now int,
  remaining_now int
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
         else null end,
    coalesce(cur.exposed_units, 0),
    coalesce(cur.remaining_units, 0)
  from fixtures f
  left join weekly_fixture_metrics cur
    on cur.fixture_id = f.id and cur.week = p_week
  left join weekly_fixture_metrics prev
    on prev.fixture_id = f.id and prev.week = p_prev_week
  where f.store_id = p_store_id
  order by coalesce(cur.amount_sold, 0) desc;
$$;
