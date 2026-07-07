-- ============================================================================
-- 0039 — floor_detail no debe perder escaneos sin mueble válido
--
-- El JOIN interno con fixtures descartaba los escaneos cuyo fixture_id ya no
-- existe en la tabla (mueble borrado/recreado), así el CSV traía MENOS unidades
-- que el piso real. Se pasa a LEFT JOIN y el mueble desconocido sale como
-- '(sin mueble)'.
-- ============================================================================

create or replace function floor_detail(p_week text)
returns table (
  tienda      text,
  mueble      text,
  sku         text,
  descripcion text,
  talla       text,
  color       text,
  genero      text,
  responsable text,
  unidades    int
) language sql stable security definer set search_path = public, pg_temp as $$
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
  )
  select st.name, l.fixture, l.sku,
         sc.description, sc.talla, sc.color, sc.gender,
         snap.resp, l.units
  from lines l
  join stores st on st.id = l.store_id
  left join stock_current sc on sc.store_id = l.store_id and sc.sku = l.sku
  left join lateral (
    select resp from stock_snapshots s
    where s.sku = l.sku and s.store_id = l.store_id
    order by snapshot_date desc limit 1
  ) snap on true
  order by st.name, l.fixture, l.sku;
$$;

revoke all on function floor_detail(text) from public;
grant execute on function floor_detail(text) to authenticated;
