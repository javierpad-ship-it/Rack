-- ============================================================================
-- 0055 — Tiendas: pertenencia a una empresa
--
-- Cada tienda pertenece a una empresa (0054). Se usa para resolver el PVP que
-- corresponde mostrar en Prisma (ver 0056). Nullable: una tienda sin empresa
-- asignada simplemente no muestra precio hasta que se le asigne.
-- ============================================================================

alter table stores add column if not exists empresa_id uuid references empresas(id) on delete set null;
create index if not exists stores_empresa_idx on stores(empresa_id);
