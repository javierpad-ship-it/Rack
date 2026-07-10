-- ============================================================================
-- 0058 — Reporte: unidades vendidas vs repuestas por tienda (últimos N días)
--
-- "Repuesto" = escaneos kind='restock' (Rack One - Repo), que suman unidades
-- por encima del último audit (0018). Se cruza contra sales_daily por fecha.
-- Grilla completa tienda×fecha (0 si no hubo movimiento ese día).
-- ============================================================================

create or replace function restock_vs_sales(p_days int default 7)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_store uuid := null;
  v_from  date := current_date - (p_days - 1);
  v_to    date := current_date;
  v_result json;
begin
  if current_role_name() not in ('admin', 'analista') then
    v_store := current_store_id();
    if v_store is null then raise exception 'Sin tienda asignada'; end if;
  end if;

  with dates as (
    select generate_series(v_from, v_to, interval '1 day')::date as d
  ),
  ven as (
    select store_id, sale_date as d, sum(units)::numeric u
    from sales_daily
    where sale_date between v_from and v_to
      and (v_store is null or store_id = v_store)
    group by store_id, sale_date
  ),
  rep as (
    select ss.store_id, ss.scanned_at::date as d, sum(sl.quantity)::numeric u
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.kind = 'restock'
      and ss.scanned_at::date between v_from and v_to
      and (v_store is null or ss.store_id = v_store)
    group by ss.store_id, ss.scanned_at::date
  ),
  stores_scope as (
    select id, name from stores where (v_store is null or id = v_store)
  ),
  grid as (
    select s.id as store_id, s.name as store, d.d
    from stores_scope s cross join dates d
  ),
  cell as (
    select g.store_id, g.store, g.d,
           coalesce(v.u, 0) as vendidas,
           coalesce(r.u, 0) as repuestas
    from grid g
    left join ven v on v.store_id = g.store_id and v.d = g.d
    left join rep r on r.store_id = g.store_id and r.d = g.d
  ),
  by_store as (
    select store_id, store,
           sum(vendidas)  as total_vendidas,
           sum(repuestas) as total_repuestas,
           json_agg(json_build_object('date', d, 'vendidas', vendidas, 'repuestas', repuestas) order by d) as by_date
    from cell
    group by store_id, store
  )
  select json_build_object(
    'from', v_from, 'to', v_to,
    'dates', (select json_agg(d order by d) from dates),
    'rows', coalesce((
      select json_agg(json_build_object(
        'store', store,
        'total_vendidas', total_vendidas,
        'total_repuestas', total_repuestas,
        'total', total_vendidas + total_repuestas,
        'by_date', by_date
      ) order by store) from by_store
    ), '[]'::json),
    'tot', (
      select json_build_object(
        'total_vendidas', coalesce(sum(total_vendidas),0),
        'total_repuestas', coalesce(sum(total_repuestas),0),
        'total', coalesce(sum(total_vendidas + total_repuestas),0)
      ) from by_store
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function restock_vs_sales(int) from public;
grant execute on function restock_vs_sales(int) to authenticated;
