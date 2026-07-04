-- ============================================================================
-- 0028 — rotation_filters en una sola pasada
--
-- Antes hacía 6 escaneos completos de la última foto de stock (~108k filas
-- cada uno, uno por filtro). Ahora materializa la foto una vez (CTE referida
-- varias veces => Postgres la materializa) y arma los 6 listados sobre ese
-- conjunto reducido en memoria.
-- ============================================================================

create or replace function rotation_filters()
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with snap as (select max(snapshot_date) d from stock_snapshots),
  s as (
    select resp, gender, mundo, embarque, brand, sap_line
    from stock_snapshots, snap
    where snapshot_date = snap.d
  )
  select json_build_object(
    'resp',     (select coalesce(json_agg(v order by v), '[]') from (select distinct resp     v from s where resp     is not null and resp     <> '') t),
    'gender',   (select coalesce(json_agg(v order by v), '[]') from (select distinct gender   v from s where gender   is not null and gender   <> '') t),
    'mundo',    (select coalesce(json_agg(v order by v), '[]') from (select distinct mundo    v from s where mundo    is not null and mundo    <> '') t),
    'embarque', (select coalesce(json_agg(v order by v), '[]') from (select distinct embarque v from s where embarque is not null and embarque <> '') t),
    'brand',    (select coalesce(json_agg(v order by v), '[]') from (select distinct brand    v from s where brand    is not null and brand    <> '') t),
    'linea',    (select coalesce(json_agg(v order by v), '[]') from (select distinct sap_line v from s where sap_line is not null and sap_line <> '') t)
  );
$$;
