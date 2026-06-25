-- ============================================================================
-- Rack — Proyección mensual de rotación (ingesta diaria)
-- Mantiene la medición semanal de Fase 1 y AGREGA una vista mensual proyectada.
-- Decisiones: atribución por ÚLTIMO mueble escaneado del mes; stock expuesto del
-- ÚLTIMO escaneo del mes; proyección LINEAL por días corridos.
-- Semana → mes: por el JUEVES de la semana ISO (ancla ISO).
-- ============================================================================

-- Jueves de una semana ISO 'IYYY-"W"IW' (ej. 2026-W26).
create or replace function iso_week_thursday(p_week text)
returns date language sql immutable as $$
  -- Lunes de la semana ISO + 3 días = jueves. Se reconstruye desde el año y nro ISO.
  select (
    to_date((substring(p_week, 1, 4)) || '-01-04', 'YYYY-MM-DD')   -- 4 de enero siempre es semana 1
    - ((extract(isodow from to_date(substring(p_week,1,4) || '-01-04','YYYY-MM-DD'))::int - 1))  -- lunes de la semana 1
    + ((substring(p_week, 7, 2)::int - 1) * 7)                       -- + (n-1) semanas
    + 3                                                              -- + 3 = jueves
  );
$$;

-- Semanas (de scan_sessions o sales) cuyo jueves cae en el mes 'YYYY-MM'.
create or replace function month_weeks(p_store_id uuid, p_month text)
returns table (week text) language sql stable as $$
  select w from (
    select week as w from scan_sessions where store_id = p_store_id
    union
    select week as w from sales where store_id = p_store_id
  ) s
  where to_char(iso_week_thursday(w), 'YYYY-MM') = p_month;
$$;

-- Métricas mensuales proyectadas por mueble.
-- Rotación proyectada = unidades proyectadas / STOCK TOTAL (piso + almacén) de los SKUs del mueble.
create or replace function fixture_monthly_metrics(p_store_id uuid, p_month text)
returns table (
  fixture_id          uuid,
  fixture_name        text,
  mtd_units           int,
  mtd_amount          numeric,
  exposed_units       int,
  total_stock         int,
  projected_units     numeric,
  projected_amount    numeric,
  rotation_projected  numeric
) language plpgsql stable security definer as $$
declare
  v_days_in_month int;
  v_days_elapsed  int;
  v_first         date;
begin
  v_first := to_date(p_month || '-01', 'YYYY-MM-DD');
  v_days_in_month := extract(day from (v_first + interval '1 month - 1 day'))::int;
  -- Días transcurridos: mes actual => hasta hoy; mes pasado => completo; mes futuro => 0/1.
  if to_char(current_date, 'YYYY-MM') = p_month then
    v_days_elapsed := (current_date - v_first) + 1;
  elsif current_date > (v_first + interval '1 month - 1 day') then
    v_days_elapsed := v_days_in_month;
  else
    v_days_elapsed := 1; -- mes futuro: evita división por cero
  end if;

  return query
  with weeks as (
    select week from month_weeks(p_store_id, p_month)
  ),
  -- Último mueble que escaneó cada SKU dentro del mes (mayor scanned_at).
  last_fixture as (
    select distinct on (sl.sku)
           sl.sku, ss.fixture_id
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id
      and ss.week in (select week from weeks)
      and sl.quantity > 0
    order by sl.sku, ss.scanned_at desc, ss.id desc
  ),
  -- Ventas acumuladas del mes (suma de semanas del mes) por SKU.
  mtd_sales as (
    select s.sku, sum(s.units)::int as units, sum(s.amount) as amount
    from sales s
    where s.store_id = p_store_id and s.week in (select week from weeks)
    group by s.sku
  ),
  -- MTD por mueble (atribución último-mueble).
  sold as (
    select lf.fixture_id,
           sum(ms.units)::int as mtd_units,
           sum(ms.amount)     as mtd_amount
    from mtd_sales ms
    join last_fixture lf on lf.sku = ms.sku
    group by lf.fixture_id
  ),
  -- Stock expuesto = último escaneo del mes por mueble.
  last_session as (
    select distinct on (ss.fixture_id) ss.id as session_id, ss.fixture_id
    from scan_sessions ss
    where ss.store_id = p_store_id and ss.week in (select week from weeks)
    order by ss.fixture_id, ss.scanned_at desc, ss.id desc
  ),
  exposed as (
    select ls.fixture_id, sum(sl.quantity)::int as exposed_units
    from last_session ls
    join scan_lines sl on sl.session_id = ls.session_id
    group by ls.fixture_id
  ),
  -- Stock total (piso + almacén) por SKU: el del mes más reciente disponible.
  sku_total_stock as (
    select distinct on (st.sku) st.sku, st.total_units
    from store_stock st
    where st.store_id = p_store_id and st.week in (select week from weeks)
    order by st.sku, st.week desc
  ),
  -- Stock total atribuido a cada mueble (por SKU según último mueble del mes).
  fixture_stock as (
    select lf.fixture_id, sum(sts.total_units)::int as total_stock
    from last_fixture lf
    join sku_total_stock sts on sts.sku = lf.sku
    group by lf.fixture_id
  )
  select
    f.id,
    f.name,
    coalesce(sold.mtd_units, 0),
    coalesce(sold.mtd_amount, 0),
    coalesce(exposed.exposed_units, 0),
    coalesce(fixture_stock.total_stock, 0),
    round(coalesce(sold.mtd_units, 0)::numeric * v_days_in_month / v_days_elapsed, 1),
    round(coalesce(sold.mtd_amount, 0) * v_days_in_month / v_days_elapsed, 2),
    case when coalesce(fixture_stock.total_stock, 0) > 0
         then round(
                (coalesce(sold.mtd_units, 0)::numeric * v_days_in_month / v_days_elapsed)
                / fixture_stock.total_stock, 4)
         else null end
  from fixtures f
  left join sold         on sold.fixture_id = f.id
  left join exposed      on exposed.fixture_id = f.id
  left join fixture_stock on fixture_stock.fixture_id = f.id
  where f.store_id = p_store_id
    and (sold.fixture_id is not null or exposed.fixture_id is not null)
  order by coalesce(sold.mtd_amount, 0) desc;
end $$;
