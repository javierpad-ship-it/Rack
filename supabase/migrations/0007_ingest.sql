-- ============================================================================
-- Rack — Fase 2 (paso 2): staging e infraestructura de ingesta
-- Tablas para recibir datos crudos del POS/ERP antes de normalizar, y trazar corridas.
-- ============================================================================

-- Configuración de integración por tienda (credenciales en Vault/secrets, no aquí).
create table if not exists integrations (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  kind        text not null,                  -- 'pos_rest' | 'sftp' | 'webhook'
  config      jsonb not null default '{}'::jsonb,
  active      boolean not null default true,
  last_run_at timestamptz,
  created_at  timestamptz not null default now(),
  unique (store_id, kind)
);

-- Log de cada corrida de ingesta (extiende la idea de import_logs para automatizado).
create table if not exists ingest_runs (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid references stores(id) on delete set null,
  kind        text not null,                  -- 'sales' | 'stock' | 'catalog'
  source      text,                           -- 'pos_rest' | 'sftp' | 'manual'
  week        text,
  status      text not null default 'running',-- 'running' | 'ok' | 'error'
  rows_in     integer not null default 0,
  rows_ok     integer not null default 0,
  rows_error  integer not null default 0,
  detail      jsonb,
  started_at  timestamptz not null default now(),
  finished_at timestamptz
);
create index if not exists ingest_runs_store_idx on ingest_runs(store_id, kind, week);

-- Staging crudo: lo que llega del origen, sin normalizar (auditoría + reproceso).
create table if not exists sales_staging (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references ingest_runs(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  week        text not null,
  raw_code    text not null,                  -- código tal cual viene del POS
  units       integer not null default 0,
  amount      numeric(14,2) not null default 0,
  processed   boolean not null default false
);
create index if not exists sales_staging_run_idx on sales_staging(run_id);

create table if not exists stock_staging (
  id          uuid primary key default gen_random_uuid(),
  run_id      uuid references ingest_runs(id) on delete cascade,
  store_id    uuid not null references stores(id) on delete cascade,
  week        text not null,
  raw_code    text not null,
  total_units integer not null default 0,
  processed   boolean not null default false
);
create index if not exists stock_staging_run_idx on stock_staging(run_id);

-- ---- RLS: lectura por tienda; escritura admin (los jobs corren con service-role) ----
alter table integrations  enable row level security;
alter table ingest_runs   enable row level security;
alter table sales_staging enable row level security;
alter table stock_staging enable row level security;

create policy integrations_read on integrations for select using (can_read_store(store_id));
create policy integrations_write on integrations for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy ingest_runs_read on ingest_runs for select
  using (store_id is null and current_role_name() in ('admin','analista') or can_read_store(store_id));
create policy ingest_runs_write on ingest_runs for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy sales_staging_read on sales_staging for select using (can_read_store(store_id));
create policy sales_staging_write on sales_staging for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy stock_staging_read on stock_staging for select using (can_read_store(store_id));
create policy stock_staging_write on stock_staging for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- ---- Normalización: staging -> sales/store_stock (resuelve alias y agrega duplicados) ----
create or replace function process_sales_staging(p_run_id uuid)
returns integer language plpgsql security definer as $$
declare
  v_store uuid;
  v_week text;
  v_rows int;
begin
  select store_id, week into v_store, v_week
  from sales_staging where run_id = p_run_id limit 1;
  if v_store is null then return 0; end if;

  insert into sales (store_id, sku, week, units, amount)
  select v_store, resolve_sku(raw_code), v_week, sum(units), sum(amount)
  from sales_staging
  where run_id = p_run_id
  group by resolve_sku(raw_code)
  on conflict (store_id, sku, week)
    do update set units = excluded.units, amount = excluded.amount;

  update sales_staging set processed = true where run_id = p_run_id;
  get diagnostics v_rows = row_count;

  perform attribute_sales(v_store, v_week);
  return v_rows;
end $$;

create or replace function process_stock_staging(p_run_id uuid)
returns integer language plpgsql security definer as $$
declare
  v_store uuid;
  v_week text;
  v_rows int;
begin
  select store_id, week into v_store, v_week
  from stock_staging where run_id = p_run_id limit 1;
  if v_store is null then return 0; end if;

  insert into store_stock (store_id, sku, week, total_units)
  select v_store, resolve_sku(raw_code), v_week, sum(total_units)
  from stock_staging
  where run_id = p_run_id
  group by resolve_sku(raw_code)
  on conflict (store_id, sku, week)
    do update set total_units = excluded.total_units;

  update stock_staging set processed = true where run_id = p_run_id;
  get diagnostics v_rows = row_count;
  return v_rows;
end $$;
