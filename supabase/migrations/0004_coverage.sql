-- ============================================================================
-- Rack — Cobertura de escaneo semanal por mueble
-- ¿Qué muebles activos ya se escanearon esta semana y cuáles faltan?
-- ============================================================================

create or replace function scan_coverage(p_store_id uuid, p_week text)
returns table (
  fixture_id   uuid,
  fixture_name text,
  scanned      boolean,
  scanned_at   timestamptz,
  skus_count   int,
  units_count  int
) language sql stable security definer as $$
  select
    f.id,
    f.name,
    (s.id is not null) as scanned,
    s.scanned_at,
    coalesce(agg.skus_count, 0),
    coalesce(agg.units_count, 0)
  from fixtures f
  -- última sesión de la semana para ese mueble
  left join lateral (
    select ss.id, ss.scanned_at
    from scan_sessions ss
    where ss.fixture_id = f.id and ss.week = p_week
    order by ss.scanned_at desc
    limit 1
  ) s on true
  left join lateral (
    select count(*)::int as skus_count, coalesce(sum(sl.quantity), 0)::int as units_count
    from scan_lines sl
    where sl.session_id = s.id
  ) agg on true
  where f.store_id = p_store_id and f.active = true
  order by scanned asc, f.name;
$$;
