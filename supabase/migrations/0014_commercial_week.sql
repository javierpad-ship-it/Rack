-- ============================================================================
-- 0014 — Semana comercial domingo→sábado, con inicio de Semana 1 por año
--
-- El negocio usa semana comercial (domingo a sábado). El inicio de la Semana 1
-- de cada año se fija a mano (calendario tipo retail/NRF), lo que resuelve las
-- diferencias por años de 53 semanas. La etiqueta sigue siendo 'YYYY-Www' para
-- que el orden y las comparaciones sigan funcionando.
--
-- Tabla `week_calendar(year, week1_start)`: week1_start es el DOMINGO en que
-- arranca la semana 1 del año comercial. La app y la web la usan para etiquetar.
-- ============================================================================

create table if not exists week_calendar (
  year        int primary key,
  week1_start date not null
);

-- Semilla por defecto: domingo de la semana (dom–sáb) que contiene el 1/1.
-- El administrador la ajusta desde el mantenimiento si su calendario difiere.
insert into week_calendar (year, week1_start)
select y,
       (to_date(y || '-01-01', 'YYYY-MM-DD')
         - extract(dow from to_date(y || '-01-01', 'YYYY-MM-DD'))::int)
from generate_series(2023, 2031) as y
on conflict (year) do nothing;

-- comm_week(date): etiqueta de semana comercial 'YYYY-Www'.
create or replace function comm_week(d date)
returns text language plpgsql stable as $$
declare
  v_year int;
  v_start date;
  v_no int;
begin
  select year, week1_start into v_year, v_start
  from week_calendar
  where week1_start <= d
  order by week1_start desc
  limit 1;

  if v_year is null then
    -- Fallback (antes de configurar): semana que contiene el 1/1 del año de d.
    v_year := extract(year from d)::int;
    v_start := (to_date(v_year || '-01-01', 'YYYY-MM-DD')
                 - extract(dow from to_date(v_year || '-01-01', 'YYYY-MM-DD'))::int);
  end if;

  v_no := floor((d - v_start) / 7)::int + 1;
  return v_year::text || '-W' || lpad(v_no::text, 2, '0');
end $$;

-- Sobrecarga para timestamptz (compatibilidad con llamadas existentes).
create or replace function comm_week(p_ts timestamptz)
returns text language sql stable as $$
  select comm_week(p_ts::date);
$$;

-- Domingo de inicio de una etiqueta 'YYYY-Www'.
create or replace function comm_week_start(p_week text)
returns date language plpgsql stable as $$
declare
  v_year int := substring(p_week, 1, 4)::int;
  v_no   int := substring(p_week, 7, 2)::int;
  v_start date;
begin
  select week1_start into v_start from week_calendar where year = v_year;
  if v_start is null then
    v_start := (to_date(v_year || '-01-01', 'YYYY-MM-DD')
                 - extract(dow from to_date(v_year || '-01-01', 'YYYY-MM-DD'))::int);
  end if;
  return v_start + (v_no - 1) * 7;
end $$;

-- El recompute del import diario ahora usa la semana comercial.
create or replace function recompute_sales_week(p_store_id uuid, p_week text)
returns void language plpgsql security definer as $$
begin
  delete from sales where store_id = p_store_id and week = p_week;
  insert into sales (store_id, sku, week, units, amount)
  select store_id, sku, p_week, sum(units)::int, sum(amount)
  from sales_daily
  where store_id = p_store_id
    and comm_week(sale_date) = p_week
  group by store_id, sku;
  perform attribute_sales(p_store_id, p_week);
end $$;

create or replace function recompute_sales_range(p_store_id uuid, p_from date, p_to date)
returns void language plpgsql security definer as $$
declare w text;
begin
  for w in
    select distinct comm_week(sale_date)
    from sales_daily
    where store_id = p_store_id and sale_date between p_from and p_to
  loop
    perform recompute_sales_week(p_store_id, w);
  end loop;
end $$;

-- La proyección mensual ancla cada semana por su MIÉRCOLES (mitad de semana
-- comercial). Redefinimos iso_week_thursday para que apunte a la semana
-- comercial, sin tocar fixture_monthly_metrics.
create or replace function iso_week_thursday(p_week text)
returns date language sql stable as $$
  select comm_week_start(p_week) + 3;
$$;
