-- ============================================================================
-- 0018 — Rack One - Repo: reposición incremental (no reemplaza el conteo)
--
-- Dos apps móviles comparten el backend:
--   * Rack One - Inventario ('audit'):  conteo completo del mueble. Re-escanear
--     pregunta Sumar/Reiniciar (0012) y SIEMPRE reemplaza lo anterior de esa
--     semana/mueble (es la foto definitiva de lo que hay en el piso).
--   * Rack One - Repo ('restock'): reposición de 1-2 productos. Nunca pregunta
--     ni reemplaza — cada reposición se SUMA por encima del último audit.
--
-- exposed_units (recalc_fixture_metrics) ya suma todas las sesiones de la
-- semana sin distinguir tipo, así que "auditoría + reposiciones posteriores"
-- se acumula solo. La Cobertura semanal, en cambio, solo debe reflejar
-- auditorías reales.
-- ============================================================================

alter table scan_sessions add column if not exists kind text not null default 'audit';
alter table scan_sessions drop constraint if exists scan_sessions_kind_chk;
alter table scan_sessions add constraint scan_sessions_kind_chk check (kind in ('audit', 'restock'));

-- Reemplazo: solo un 'audit' nuevo reemplaza TODO lo anterior de ese mueble/
-- semana (audit + restocks acumulados hasta ahora), porque es el recuento
-- físico definitivo. Un 'restock' nunca borra nada, siempre es aditivo.
create or replace function scan_sessions_replace_dup()
returns trigger language plpgsql as $$
begin
  if new.kind = 'audit' then
    delete from scan_sessions s
     where s.store_id = new.store_id
       and s.fixture_id = new.fixture_id
       and s.week = new.week
       and s.client_uid is distinct from new.client_uid;
  end if;
  return new;
end $$;

-- Cobertura semanal: solo cuenta auditorías (Rack One - Inventario), no
-- reposiciones sueltas de Rack One - Repo.
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
  left join lateral (
    select ss.id, ss.scanned_at
    from scan_sessions ss
    where ss.fixture_id = f.id and ss.week = p_week and ss.kind = 'audit'
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

-- El rol 'reponedor' puede escanear (escribir scan_sessions/scan_lines) en su
-- tienda, igual que operario/encargado/visual.
create or replace function can_write_store(p_store uuid)
returns boolean language sql stable security definer as $$
  select case
    when current_role_name() = 'admin' then true
    when current_role_name() in ('visual', 'encargado', 'operario', 'reponedor')
      then p_store = current_store_id()
    else false
  end;
$$;
