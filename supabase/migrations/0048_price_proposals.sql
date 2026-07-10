-- ============================================================================
-- 0048 — Prisma: propuestas de precio (piso → aprobación)
--
-- Desde Prisma, cualquier usuario con acceso puede **proponer un nuevo precio**
-- para un genérico (a nivel genérico + Org de su tienda). La propuesta la revisa
-- el **responsable de línea** (`resp`) en Rack One: aceptar / denegar /
-- contraproponer. La decisión vuelve a Prisma como alerta (el badge usa
-- `seen_by_requester_at`). Los aceptados se exportan a SAP (0049).
-- ============================================================================

do $$ begin
  if not exists (select 1 from pg_type where typname = 'price_proposal_status') then
    create type price_proposal_status as enum ('pendiente','aceptada','denegada','contrapropuesta');
  end if;
end $$;

create table if not exists price_proposals (
  id            bigint generated always as identity primary key,
  generic_code  text not null,
  sku           text,                       -- variante escaneada (referencia)
  store_id      uuid references stores(id) on delete set null,
  sales_org     text,                       -- Org de la tienda de origen
  requested_by  uuid references auth.users(id) on delete set null,
  reason        text,
  resp          text,                       -- línea responsable (snapshot para la RLS/bandeja)
  current_pvp   numeric(12,2),
  proposed_pvp  numeric(12,2) not null,
  status        price_proposal_status not null default 'pendiente',
  decided_pvp   numeric(12,2),              -- precio final (contrapropuesta o = propuesto)
  reviewed_by   uuid references auth.users(id) on delete set null,
  reviewed_at   timestamptz,
  review_note   text,
  seen_by_requester_at timestamptz,         -- null = alerta sin ver
  exported_at   timestamptz,
  created_at    timestamptz not null default now()
);
create index if not exists price_proposals_requester_idx on price_proposals(requested_by, created_at desc);
create index if not exists price_proposals_resp_idx      on price_proposals(resp, status);
create index if not exists price_proposals_status_idx    on price_proposals(status);

alter table price_proposals enable row level security;

-- Lectura: el solicitante ve las suyas; admin/analista todas; el responsable de
-- la línea (`resp`) ve las de sus líneas.
drop policy if exists price_proposals_read on price_proposals;
create policy price_proposals_read on price_proposals for select using (
  requested_by = auth.uid()
  or current_role_name() in ('admin','analista')
  or exists (select 1 from user_lines ul where ul.user_id = auth.uid() and ul.resp = price_proposals.resp)
);

-- Alta: cualquier usuario de Prisma crea propuestas a su nombre.
drop policy if exists price_proposals_insert on price_proposals;
create policy price_proposals_insert on price_proposals for insert
  with check (requested_by = auth.uid());

-- Decisión / marca de vista: admin o el responsable de la línea.
drop policy if exists price_proposals_update on price_proposals;
create policy price_proposals_update on price_proposals for update using (
  requested_by = auth.uid()  -- el solicitante puede marcar "visto"
  or current_role_name() = 'admin'
  or exists (select 1 from user_lines ul where ul.user_id = auth.uid() and ul.resp = price_proposals.resp)
);
