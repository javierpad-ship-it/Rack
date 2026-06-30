-- ============================================================================
-- 0012 — Re-escaneo reemplaza: una sola sesión por (tienda, mueble, semana)
--
-- Regla de negocio (confirmada): si un mueble se escanea más de una vez en la
-- misma semana, el ÚLTIMO escaneo reemplaza al anterior (recuento/corrección),
-- en vez de sumarse. Sin esto, `exposed_units` y el almacén deducido se
-- duplicaban al haber dos sesiones para el mismo mueble/semana.
--
-- Implementación: trigger BEFORE INSERT en scan_sessions que elimina cualquier
-- sesión previa del mismo (store, fixture, week) con distinto client_uid.
-- Las scan_lines de la sesión vieja se borran en cascada. El re-envío
-- idempotente de la MISMA sesión (mismo client_uid) no borra nada (ON CONFLICT
-- por client_uid lo resuelve como update).
-- ============================================================================

create or replace function scan_sessions_replace_dup()
returns trigger language plpgsql as $$
begin
  delete from scan_sessions s
   where s.store_id = new.store_id
     and s.fixture_id = new.fixture_id
     and s.week = new.week
     and s.client_uid is distinct from new.client_uid;
  return new;
end $$;

drop trigger if exists scan_sessions_replace on scan_sessions;
create trigger scan_sessions_replace
  before insert on scan_sessions
  for each row execute function scan_sessions_replace_dup();

-- Limpieza de duplicados ya existentes (si los hubiera): conserva, por cada
-- (store, fixture, week), la sesión con scanned_at más reciente.
delete from scan_sessions s
using scan_sessions keep
where s.store_id = keep.store_id
  and s.fixture_id = keep.fixture_id
  and s.week = keep.week
  and s.id <> keep.id
  and (keep.scanned_at, keep.id) > (s.scanned_at, s.id);
