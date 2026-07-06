-- ============================================================================
-- 0032 — Reporte Piso de venta vs Almacén por tienda (con rotación del piso)
--
-- Piso de venta = unidades escaneadas en los muebles esa semana (scan_lines).
-- Almacén       = stock total de la tienda − piso (lo que no está expuesto).
-- Rotación piso = IRP con el piso como stock: ventas / (ventas + piso) × 100.
-- Proyección    = la venta de la semana escalada a los días del mes
--                 (ventas × días_mes / 7), para estimar el IRP mensual del piso.
--
-- Período: una semana comercial (dom→sáb). Total de tienda = store_stock de la
-- semana; si esa semana no tiene foto, cae a stock_current (foto vigente).
-- ============================================================================

create or replace function floor_vs_warehouse(p_week text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_store  uuid := null;
  v_start  date := comm_week_start(p_week);
  v_end    date := comm_week_start(p_week) + 6;
  v_dim    int  := extract(day from (date_trunc('month', comm_week_start(p_week)) + interval '1 month - 1 day'))::int;
  v_factor numeric := v_dim::numeric / 7;   -- proyección semana → mes
  v_result json;
begin
  if current_role_name() not in ('admin', 'analista') then
    v_store := current_store_id();
    if v_store is null then
      raise exception 'Sin tienda asignada';
    end if;
  end if;

  with piso as (
    select ss.store_id, sum(sl.quantity)::numeric u
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.week = p_week and (v_store is null or ss.store_id = v_store)
    group by ss.store_id
  ),
  stk_week as (
    select store_id, sum(total_units)::numeric u
    from store_stock where week = p_week and (v_store is null or store_id = v_store)
    group by store_id
  ),
  stk_cur as (
    select store_id, sum(units)::numeric u
    from stock_current where (v_store is null or store_id = v_store)
    group by store_id
  ),
  ven as (
    select store_id, sum(units)::numeric u
    from sales_daily
    where sale_date between v_start and v_end and (v_store is null or store_id = v_store)
    group by store_id
  ),
  base as (
    select st.id as store_id, st.name as store,
           coalesce(p.u, 0)               as piso,
           coalesce(sw.u, sc.u, 0)        as total,
           coalesce(v.u, 0)               as ventas
    from stores st
    left join piso    p  on p.store_id  = st.id
    left join stk_week sw on sw.store_id = st.id
    left join stk_cur  sc on sc.store_id = st.id
    left join ven     v  on v.store_id  = st.id
    where (v_store is null or st.id = v_store)
  ),
  calc as (
    select store, piso, greatest(total - piso, 0) as almacen, total, ventas,
           case when total > 0 then round(piso / total * 100, 1) else 0 end as pct_piso,
           case when (ventas + piso) > 0 then round(ventas / (ventas + piso) * 100, 1) else 0 end as irp,
           case when (ventas * v_factor + piso) > 0
                then round(ventas * v_factor / (ventas * v_factor + piso) * 100, 1) else 0 end as irp_proy
    from base
    where piso > 0 or total > 0 or ventas > 0
  )
  select json_build_object(
    'week', p_week,
    'from', v_start,
    'to', v_end,
    'dias_mes', v_dim,
    'rows', (
      select coalesce(json_agg(json_build_object(
        'store', store, 'piso', piso, 'almacen', almacen, 'total', total,
        'pct_piso', pct_piso, 'ventas', ventas, 'irp', irp, 'irp_proy', irp_proy
      ) order by ventas desc), '[]')
      from calc
    ),
    'tot', (
      select json_build_object(
        'piso', coalesce(sum(piso), 0),
        'almacen', coalesce(sum(almacen), 0),
        'total', coalesce(sum(total), 0),
        'ventas', coalesce(sum(ventas), 0),
        'pct_piso', case when sum(total) > 0 then round(sum(piso) / sum(total) * 100, 1) else 0 end,
        'irp', case when (sum(ventas) + sum(piso)) > 0 then round(sum(ventas) / (sum(ventas) + sum(piso)) * 100, 1) else 0 end,
        'irp_proy', case when (sum(ventas) * v_factor + sum(piso)) > 0
                         then round(sum(ventas) * v_factor / (sum(ventas) * v_factor + sum(piso)) * 100, 1) else 0 end
      )
      from calc
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function floor_vs_warehouse(text) from public;
grant execute on function floor_vs_warehouse(text) to authenticated;
