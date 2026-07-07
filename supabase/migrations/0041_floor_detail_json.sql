-- ============================================================================
-- 0041 — floor_detail devuelve JSON (evita el límite de 1000 filas de PostgREST)
--
-- Al devolver una TABLA, PostgREST cortaba la respuesta en 1000 filas y el CSV
-- salía incompleto. Ahora devuelve un único JSON (array) con TODO el detalle,
-- sin tope de filas. El cliente ya lo lee como array.
-- ============================================================================

create or replace function floor_detail(p_week text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with role_store as (
    select case when current_role_name() in ('admin','analista') then null
                else current_store_id() end as sid
  ),
  lines as (
    select ses.store_id, coalesce(f.name, '(sin mueble)') as fixture, sl.sku,
           sum(sl.quantity)::int as units
    from scan_sessions ses
    join scan_lines sl on sl.session_id = ses.id
    left join fixtures f on f.id = ses.fixture_id
    where ses.week = p_week
      and ((select sid from role_store) is null or ses.store_id = (select sid from role_store))
    group by ses.store_id, coalesce(f.name, '(sin mueble)'), sl.sku
  ),
  detail as (
    select st.name as tienda, l.fixture as mueble, l.sku,
           sc.description as descripcion, sc.talla, sc.color, sc.gender as genero,
           snap.resp as responsable, l.units as unidades
    from lines l
    join stores st on st.id = l.store_id
    left join stock_current sc on sc.store_id = l.store_id and sc.sku = l.sku
    left join lateral (
      select resp from stock_snapshots s
      where s.sku = l.sku and s.store_id = l.store_id
      order by snapshot_date desc limit 1
    ) snap on true
    order by st.name, l.fixture, l.sku
  )
  select coalesce(json_agg(row_to_json(detail)), '[]') from detail;
$$;

revoke all on function floor_detail(text) from public;
grant execute on function floor_detail(text) to authenticated;
