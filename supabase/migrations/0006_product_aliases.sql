-- ============================================================================
-- Rack — Fase 2 (paso 1): alias de producto
-- Mapea códigos del POS/ERP (EAN, código interno) al SKU canónico del catálogo.
-- No altera la lógica de Fase 1; la resolución se aplica en la ingesta de ventas.
-- ============================================================================

create table if not exists product_aliases (
  alias       text primary key,
  sku         text not null references products(sku) on delete cascade,
  source      text,                 -- p.ej. 'pos', 'ean', 'manual'
  created_at  timestamptz not null default now()
);
create index if not exists product_aliases_sku_idx on product_aliases(sku);

alter table product_aliases enable row level security;

create policy aliases_read on product_aliases for select using (auth.uid() is not null);
create policy aliases_write on product_aliases for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- Resuelve un código a su SKU canónico: si es alias devuelve el sku, si no, el mismo código.
create or replace function resolve_sku(p_code text)
returns text language sql stable as $$
  select coalesce((select sku from product_aliases where alias = p_code), p_code);
$$;
