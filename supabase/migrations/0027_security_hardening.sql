-- ============================================================================
-- 0027 — Endurecimiento de seguridad y correcciones de auditoría
--
-- Hallazgos de la auditoría (2026-07-04):
--  C1. sales_daily estaba SIN RLS: legible/escribible por cualquier autenticado.
--  C2. RPCs mutantes SECURITY DEFINER (recompute/apply/attribute/recalc/process)
--      eran invocables por cualquier autenticado vía PostgREST → un operario
--      podía borrar/recalcular ventas de cualquier tienda. Se revoca EXECUTE.
--  P0. rotation_report quedó con DOS sobrecargas (0024 de 8 args y 0025 de 11):
--      PostgREST puede dar "Could not choose the best candidate" (PGRST203).
--  A1. Reportes DEFINER exponían datos cross-tienda a cualquier autenticado:
--      ahora los roles que no son admin/analista quedan forzados a su tienda.
--  A2. stock_current / stock_snapshots leían con 'authenticated': pasan a
--      can_read_store(store_id) como el resto de tablas multi-tienda.
--  M1. SECURITY DEFINER sin search_path fijo: se fija en las funciones clave.
--  P2. recompute_sales_range no recalculaba semanas cuyo detalle diario fue
--      borrado por completo: ahora itera todas las semanas del rango de fechas.
--  P2. week_calendar sembrada solo hasta 2031: se extiende a 2035.
-- ============================================================================

-- ---- C1: RLS en sales_daily -------------------------------------------------
alter table sales_daily enable row level security;
drop policy if exists sales_daily_read on sales_daily;
create policy sales_daily_read on sales_daily for select
  using (can_read_store(store_id));
-- Sin policy de escritura: solo service-role (Server Actions) escribe.

-- ---- P0: eliminar la sobrecarga vieja de rotation_report ---------------------
drop function if exists rotation_report(date, date, uuid, text, text, text, text, text);

-- ---- C2: revocar EXECUTE de las RPCs mutantes a clientes ---------------------
do $$
declare f text;
begin
  foreach f in array array[
    'attribute_sales(uuid, text)',
    'recalc_fixture_metrics(uuid, text)',
    'recompute_sales_week(uuid, text)',
    'recompute_sales_range(uuid, date, date)',
    'apply_stock_snapshot(uuid)',
    'apply_stock_snapshot(uuid, date)',
    'process_sales_staging(uuid)',
    'process_stock_staging(uuid)'
  ] loop
    begin
      execute format('revoke execute on function %s from public, anon, authenticated', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- ---- A2: lectura de stock por tienda (admin/analista ven todo) ---------------
drop policy if exists stock_current_read on stock_current;
create policy stock_current_read on stock_current for select
  using (can_read_store(store_id));
drop policy if exists stock_snapshots_read on stock_snapshots;
create policy stock_snapshots_read on stock_snapshots for select
  using (can_read_store(store_id));

-- ---- M1: fijar search_path en funciones SECURITY DEFINER existentes ----------
do $$
declare f text;
begin
  foreach f in array array[
    'current_role_name()',
    'can_read_store(uuid)',
    'can_write_store(uuid)',
    'attribute_sales(uuid, text)',
    'recalc_fixture_metrics(uuid, text)',
    'recompute_sales_week(uuid, text)',
    'recompute_sales_range(uuid, date, date)',
    'apply_stock_snapshot(uuid)',
    'apply_stock_snapshot(uuid, date)',
    'process_sales_staging(uuid)',
    'process_stock_staging(uuid)',
    'scan_coverage(uuid, text)',
    'store_warehouse(uuid, text)',
    'fixture_week_over_week(uuid, text, text)',
    'fixture_monthly_metrics(uuid, text)',
    'current_comm_week()',
    'month_end_stock_date(uuid, text)',
    'rotation_filters()'
  ] loop
    begin
      execute format('alter function %s set search_path = public, pg_temp', f);
    exception when undefined_function then null;
    end;
  end loop;
end $$;

-- ---- P2: week_calendar hasta 2035 --------------------------------------------
insert into week_calendar (year, week1_start)
select y,
       (to_date(y || '-01-01', 'YYYY-MM-DD')
         - extract(dow from to_date(y || '-01-01', 'YYYY-MM-DD'))::int)
from generate_series(2032, 2035) as y
on conflict (year) do nothing;

-- ---- P2: recompute_sales_range cubre semanas borradas -------------------------
create or replace function recompute_sales_week(p_store_id uuid, p_week text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
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
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare w text;
begin
  -- Itera TODAS las semanas comerciales que tocan el rango de fechas (aunque
  -- el detalle diario de alguna haya quedado vacío: así se limpian residuos).
  for w in
    select distinct comm_week(d::date)
    from generate_series(p_from, p_to, interval '1 day') as d
  loop
    perform recompute_sales_week(p_store_id, w);
  end loop;
end $$;

revoke execute on function recompute_sales_week(uuid, text) from public, anon, authenticated;
revoke execute on function recompute_sales_range(uuid, date, date) from public, anon, authenticated;

-- ---- A1: reportes de rotación limitados por rol/tienda ------------------------
create or replace function rotation_report(
  p_from     date,
  p_to       date,
  p_group_by text default 'resp',
  p_store    uuid default null,
  p_gender   text default null,
  p_mundo    text default null,
  p_embarque text default null,
  p_brand    text default null,
  p_linea    text default null,
  p_resp     text default null
)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_complete boolean;
  v_factor  numeric;
  v_result  json;
begin
  -- Roles atados a una tienda solo ven la suya (admin/analista ven todas).
  if current_role_name() not in ('admin', 'analista') then
    p_store := current_store_id();
    if p_store is null then
      raise exception 'Sin tienda asignada';
    end if;
  end if;

  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;

  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_complete := p_to <= v_today;
  v_factor  := case when v_complete or v_elapsed <= 0 then 1
                    else v_total::numeric / v_elapsed end;

  with dims as (
    select sku,
           max(resp)     as resp,
           max(gender)   as gender,
           max(mundo)    as mundo,
           max(embarque) as embarque,
           max(brand)    as brand,
           max(sap_line) as linea,
           max(talla)    as talla,
           sum(units)::numeric  as stk,
           sum(value)::numeric  as stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (p_store is null or store_id = p_store)
    group by sku
  ),
  sal as (
    select sku, sum(units)::numeric as cant, sum(amount)::numeric as val
    from sales_daily
    where sale_date between p_from and p_to
      and (p_store is null or store_id = p_store)
    group by sku
  ),
  base as (
    select
      case p_group_by
        when 'linea'  then coalesce(d.linea,  '(sin línea)')
        when 'brand'  then coalesce(d.brand,  '(sin marca)')
        when 'mundo'  then coalesce(d.mundo,  '(sin mundo)')
        when 'gender' then coalesce(d.gender, '(sin género)')
        else coalesce(d.resp, '(sin responsable)')
      end as grp,
      d.talla,
      coalesce(s.cant, 0) as cant,
      coalesce(s.val, 0)  as val,
      coalesce(d.stk, 0)  as stk,
      coalesce(d.stk_val, 0) as stk_val,
      case when coalesce(s.cant,0) > 0 then s.val / s.cant end as pvp
    from dims d
    full outer join sal s on s.sku = d.sku
    where (p_gender   is null or d.gender   = p_gender)
      and (p_mundo    is null or d.mundo    = p_mundo)
      and (p_embarque is null or d.embarque = p_embarque)
      and (p_brand    is null or d.brand    = p_brand)
      and (p_linea    is null or d.linea    = p_linea)
      and (p_resp     is null or d.resp     = p_resp)
  ),
  banded as (
    select *,
      case
        when pvp is null then null
        when pvp < 9  then '<9'
        when pvp < 10 then '9-10'
        when pvp < 20 then '10-20'
        when pvp < 30 then '20-30'
        when pvp < 40 then '30-40'
        when pvp < 50 then '40-50'
        when pvp < 70 then '50-70'
        else '70+'
      end as band
    from base
  ),
  g_rows as (
    select grp,
           sum(cant) cant, sum(val) val, sum(stk) stk, sum(stk_val) stk_val,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp,
           case when (sum(cant)*v_factor+sum(stk))>0
                then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end as irp_proy
    from banded group by grp
  ),
  g_price as (
    select grp, band, sum(cant) cant,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded where band is not null group by grp, band
  ),
  g_talla as (
    select grp, coalesce(talla,'(s/t)') as talla, sum(cant) cant,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded group by grp, coalesce(talla,'(s/t)')
  )
  select json_build_object(
    'snap', v_snap,
    'complete', v_complete,
    'days_total', v_total,
    'days_elapsed', v_elapsed,
    'group_by', p_group_by,
    'kpis', (
      select json_build_object(
        'cant', coalesce(sum(cant),0),
        'val',  coalesce(sum(val),0),
        'stk',  coalesce(sum(stk),0),
        'stk_val', coalesce(sum(stk_val),0),
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'proy_cant', round(coalesce(sum(cant),0) * v_factor),
        'irp_proy', case when (sum(cant)*v_factor+sum(stk))>0
                         then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end
      ) from banded
    ),
    'rows', (
      select coalesce(json_agg(json_build_object(
        'grp', grp, 'cant', cant, 'val', val, 'stk', stk, 'stk_val', stk_val,
        'irp', irp, 'irp_proy', irp_proy) order by val desc), '[]')
      from g_rows
    ),
    'price_hm', (
      select coalesce(json_agg(json_build_object('grp', grp, 'band', band, 'irp', irp, 'cant', cant)), '[]')
      from g_price
    ),
    'talla_hm', (
      select coalesce(json_agg(json_build_object('grp', grp, 'talla', talla, 'irp', irp, 'cant', cant)), '[]')
      from g_talla
    )
  ) into v_result;

  return v_result;
end $$;

create or replace function rotation_stores(
  p_from     date,
  p_to       date,
  p_gender   text default null,
  p_mundo    text default null,
  p_embarque text default null,
  p_brand    text default null,
  p_linea    text default null,
  p_resp     text default null
)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_factor  numeric;
  v_store   uuid := null;  -- restricción por rol
  v_result  json;
begin
  if current_role_name() not in ('admin', 'analista') then
    v_store := current_store_id();
    if v_store is null then
      raise exception 'Sin tienda asignada';
    end if;
  end if;

  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;
  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_factor  := case when p_to <= v_today or v_elapsed <= 0 then 1 else v_total::numeric / v_elapsed end;

  with dims as (
    select sku, max(gender) gender, max(mundo) mundo, max(embarque) embarque,
           max(brand) brand, max(sap_line) linea, max(resp) resp
    from stock_snapshots where snapshot_date = v_snap group by sku
  ),
  ok_sku as (
    select sku from dims
    where (p_gender   is null or gender   = p_gender)
      and (p_mundo    is null or mundo    = p_mundo)
      and (p_embarque is null or embarque = p_embarque)
      and (p_brand    is null or brand    = p_brand)
      and (p_linea    is null or linea    = p_linea)
      and (p_resp     is null or resp     = p_resp)
  ),
  sal as (
    select store_id, sum(units)::numeric cant, sum(amount)::numeric val
    from sales_daily
    where sale_date between p_from and p_to
      and (v_store is null or store_id = v_store)
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  stk as (
    select store_id, sum(units)::numeric stk, sum(value)::numeric stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (v_store is null or store_id = v_store)
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  base as (
    select st.id as store_id, st.name,
           coalesce(sal.cant,0) cant, coalesce(sal.val,0) val,
           coalesce(stk.stk,0) stk, coalesce(stk.stk_val,0) stk_val
    from stores st
    left join sal on sal.store_id = st.id
    left join stk on stk.store_id = st.id
    where (v_store is null or st.id = v_store)
  )
  select coalesce(json_agg(json_build_object(
    'store', name, 'cant', cant, 'val', val, 'stk', stk, 'stk_val', stk_val,
    'irp', case when (cant+stk)>0 then round(cant/(cant+stk)*100,1) else 0 end,
    'irp_proy', case when (cant*v_factor+stk)>0 then round(cant*v_factor/(cant*v_factor+stk)*100,1) else 0 end
  ) order by val desc), '[]')
  into v_result
  from base where cant > 0 or stk > 0;

  return v_result;
end $$;
