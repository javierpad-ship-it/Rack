-- ============================================================================
-- 0015 — El servidor sella la semana comercial de cada escaneo
--
-- La app trabaja offline y no conoce el calendario comercial configurable.
-- Para que la semana sea siempre coherente con week_calendar, el servidor
-- reescribe scan_sessions.week = comm_week(scanned_at) al insertar. Así la
-- app no necesita el calendario y la atribución/cobertura cruzan bien.
--
-- Debe correr ANTES del trigger de reemplazo (0012), que usa new.week; por eso
-- el nombre empieza con dígitos (orden alfabético de disparo).
-- ============================================================================

create or replace function scan_sessions_set_week()
returns trigger language plpgsql as $$
begin
  new.week := comm_week(new.scanned_at);
  return new;
end $$;

drop trigger if exists scan_sessions_00_setweek on scan_sessions;
create trigger scan_sessions_00_setweek
  before insert on scan_sessions
  for each row execute function scan_sessions_set_week();

-- Semana comercial vigente (para defaults y tablero).
create or replace function current_comm_week()
returns text language sql stable security definer as $$
  select comm_week(now());
$$;

-- week_calendar: lectura para usuarios autenticados; escritura solo service-role.
alter table week_calendar enable row level security;
drop policy if exists week_calendar_read on week_calendar;
create policy week_calendar_read on week_calendar for select
  using (auth.role() = 'authenticated');
