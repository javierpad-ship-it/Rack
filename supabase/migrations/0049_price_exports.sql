-- ============================================================================
-- 0049 — Prisma: lotes de exportación a SAP
--
-- Los precios aceptados se marcan y se exportan a un archivo con estructura SAP
-- (Material + Org.Ventas + Inicio/Fin Validez + Precio Vta.Público). Un cambio
-- puede aplicarse a **R050, R040 o ambas** — por eso el lote guarda `orgs[]` y
-- una fila por (propuesta, Org). Al generar, se sella `price_proposals.exported_at`
-- y se agrega la fila correspondiente a `generic_prices` (nuevo precio vigente).
-- ============================================================================

create table if not exists price_change_exports (
  id           bigint generated always as identity primary key,
  orgs         text[] not null,             -- {'R050'} | {'R040'} | {'R050','R040'}
  valid_from   date not null,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now()
);

create table if not exists price_change_export_items (
  export_id    bigint not null references price_change_exports(id) on delete cascade,
  proposal_id  bigint references price_proposals(id) on delete set null,
  generic_code text not null,
  sales_org    text not null,
  pvp          numeric(12,2) not null,
  primary key (export_id, generic_code, sales_org)
);

alter table price_change_exports      enable row level security;
alter table price_change_export_items enable row level security;

drop policy if exists price_exports_read on price_change_exports;
create policy price_exports_read on price_change_exports for select
  using (current_role_name() in ('admin','analista') or generated_by = auth.uid());

drop policy if exists price_export_items_read on price_change_export_items;
create policy price_export_items_read on price_change_export_items for select
  using (auth.uid() is not null);
