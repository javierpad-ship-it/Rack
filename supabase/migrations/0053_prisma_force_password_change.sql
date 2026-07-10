-- ============================================================================
-- 0053 — Prisma: forzar cambio de clave en el primer ingreso
--
-- La clave inicial de un usuario Prisma es su propio DNI (y el reset también
-- la deja en el DNI). `must_change_password` se activa al crear/resetear y se
-- apaga con `complete_password_change()` — un RPC que el propio usuario invoca
-- tras cambiar su clave (auth.updateUser), sin necesitar service-role en la app.
-- ============================================================================

alter table profiles add column if not exists must_change_password boolean not null default false;

create or replace function complete_password_change()
returns void language plpgsql security definer as $$
begin
  update profiles set must_change_password = false where id = auth.uid();
end $$;
