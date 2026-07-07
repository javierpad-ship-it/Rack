-- ============================================================================
-- 0040 — floor_breakdown: atributos y stock por el ÚLTIMO snapshot que contiene
--         cada SKU (no solo el más reciente global)
--
-- Cuando la última foto de stock es parcial (le faltan SKUs), esos artículos
-- escaneados quedaban sin responsable/género. Ahora dims resuelve, por SKU, la
-- fila del snapshot más reciente que lo menciona (distinct on sku, fecha desc),
-- de donde salen resp/género/mundo/línea/artículo y el stock. Robusto a fotos
-- parciales.
-- ============================================================================

create or replace function floor_breakdown(p_week text, p_store uuid, p_by text default 'resp')
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_start  date := comm_week_start(p_week);
  v_end    date := comm_week_start(p_week) + 6;
  v_dim    int  := extract(day from (date_trunc('month', comm_week_start(p_week)) + interval '1 month - 1 day'))::int;
  v_factor numeric := v_dim::numeric / 7;
  v_result json;
begin
  if current_role_name() not in ('admin', 'analista') then
    p_store := current_store_id();
    if p_store is null then raise exception 'Sin tienda asignada'; end if;
  end if;

  with dims as (
    select distinct on (sku) sku, resp, gender, mundo, sap_line as linea,
           article_code as articulo, units::numeric as stk
    from stock_snapshots where store_id = p_store
    order by sku, snapshot_date desc
  ),
  piso as (
    select sl.sku, sum(sl.quantity)::numeric u
    from scan_sessions ss join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store and ss.week = p_week group by sl.sku
  ),
  ven as (
    select sku, sum(units)::numeric u from sales_daily
    where store_id = p_store and sale_date between v_start and v_end group by sku
  ),
  u as (select sku from dims union select sku from piso union select sku from ven),
  base as (
    select u.sku,
      coalesce(d.resp,'(sin responsable)') resp, coalesce(d.gender,'(sin género)') gender,
      coalesce(d.mundo,'(sin mundo)') mundo, coalesce(d.linea,'(sin línea)') linea,
      coalesce(d.articulo,'(sin artículo)') articulo,
      coalesce(p.u,0) piso, coalesce(d.stk,0) total, coalesce(v.u,0) ventas
    from u
    left join dims d on d.sku = u.sku
    left join piso p on p.sku = u.sku
    left join ven  v on v.sku = u.sku
  ),
  keyed as (
    select case p_by
             when 'gender'   then gender
             when 'mundo'    then mundo
             when 'linea'    then linea
             when 'articulo' then articulo
             else resp
           end as key,
           piso, greatest(total - piso, 0) almacen, total, ventas
    from base
  ),
  agg as (
    select key, sum(piso) piso, sum(almacen) almacen, sum(total) total, sum(ventas) ventas,
      case when (sum(ventas)+sum(piso))>0 then round(sum(ventas)/(sum(ventas)+sum(piso))*100,1) else 0 end irp,
      case when (sum(ventas)*v_factor+sum(piso))>0
           then round(sum(ventas)*v_factor/(sum(ventas)*v_factor+sum(piso))*100,1) else 0 end irp_proy,
      case when sum(total)>0 then round(sum(piso)/sum(total)*100,1) else 0 end pct_piso
    from keyed group by key
  )
  select json_build_object(
    'by', p_by,
    'rows', (
      select coalesce(json_agg(json_build_object(
        'key', key, 'piso', piso, 'almacen', almacen, 'total', total, 'ventas', ventas,
        'irp', irp, 'irp_proy', irp_proy, 'pct_piso', pct_piso) order by ventas desc), '[]')
      from agg where piso > 0 or total > 0 or ventas > 0
    ),
    'tot', (
      select json_build_object(
        'piso', coalesce(sum(piso),0), 'almacen', coalesce(sum(almacen),0),
        'total', coalesce(sum(total),0), 'ventas', coalesce(sum(ventas),0),
        'irp', case when (sum(ventas)+sum(piso))>0 then round(sum(ventas)/(sum(ventas)+sum(piso))*100,1) else 0 end,
        'irp_proy', case when (sum(ventas)*v_factor+sum(piso))>0
                         then round(sum(ventas)*v_factor/(sum(ventas)*v_factor+sum(piso))*100,1) else 0 end,
        'pct_piso', case when sum(total)>0 then round(sum(piso)/sum(total)*100,1) else 0 end
      ) from keyed
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function floor_breakdown(text, uuid, text) from public;
grant execute on function floor_breakdown(text, uuid, text) to authenticated;
