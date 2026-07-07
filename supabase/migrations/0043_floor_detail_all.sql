-- ============================================================================
-- 0043 — floor_detail_all: detalle de piso de TODAS las tiendas (para el export
--        nocturno server-side con service-role)
--
-- Igual que floor_detail pero SIN el filtro por rol (siempre todas las tiendas).
-- Solo lo usa el endpoint /api/export/floor con la service-role key (protegido
-- por token). No se otorga a 'authenticated' para no saltear RLS desde el cliente.
-- ============================================================================

create or replace function floor_detail_all(p_week text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with alias as (
    select store_id, string_agg(distinct alias, ' / ' order by alias) as a
    from store_aliases group by store_id
  ),
  lines as (
    select ses.store_id, coalesce(f.name, '(sin mueble)') as fixture, sl.sku,
           sum(sl.quantity)::int as units
    from scan_sessions ses
    join scan_lines sl on sl.session_id = ses.id
    left join fixtures f on f.id = ses.fixture_id
    where ses.week = p_week
    group by ses.store_id, coalesce(f.name, '(sin mueble)'), sl.sku
  ),
  detail as (
    select st.name as tienda, coalesce(al.a, '') as tienda_archivo,
           l.fixture as mueble, l.sku,
           sc.description as descripcion, sc.talla, sc.color, sc.gender as genero,
           snap.resp as responsable, l.units as unidades
    from lines l
    join stores st on st.id = l.store_id
    left join alias al on al.store_id = l.store_id
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

revoke all on function floor_detail_all(text) from public, authenticated, anon;
