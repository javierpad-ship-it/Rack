-- ============================================================================
-- 0054 — Empresas (mantenimiento)
--
-- Catálogo de empresas para el mantenimiento admin. Campos:
--   nombre          — nombre de la empresa
--   nombre_reporte  — nombre tal como debe aparecer en los reportes
--   codigo_sap      — código de la empresa en SAP
-- Lectura para autenticados; escritura solo admin (vía RLS).
-- ============================================================================

create table if not exists empresas (
  id             uuid primary key default gen_random_uuid(),
  nombre         text not null,
  nombre_reporte text,
  codigo_sap     text,
  created_at     timestamptz not null default now()
);

alter table empresas enable row level security;

drop policy if exists empresas_read on empresas;
create policy empresas_read on empresas for select
  using (auth.uid() is not null);

drop policy if exists empresas_write on empresas;
create policy empresas_write on empresas for all
  using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');
