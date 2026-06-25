-- ============================================================================
-- Rack — Esquema inicial
-- Multi-tienda: rotación y venta por mueble.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ----------------------------------------------------------------------------
-- Roles
-- ----------------------------------------------------------------------------
do $$ begin
  create type user_role as enum ('admin', 'analista', 'visual', 'encargado', 'operario');
exception
  when duplicate_object then null;
end $$;

-- ----------------------------------------------------------------------------
-- Tiendas
-- ----------------------------------------------------------------------------
create table if not exists stores (
  id          uuid primary key default gen_random_uuid(),
  code        text not null unique,
  name        text not null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Perfiles (extiende auth.users de Supabase)
-- store_id NULL => acceso central (admin / analista)
-- ----------------------------------------------------------------------------
create table if not exists profiles (
  id          uuid primary key references auth.users(id) on delete cascade,
  full_name   text,
  role        user_role not null default 'operario',
  store_id    uuid references stores(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Catálogo maestro de productos
-- ----------------------------------------------------------------------------
create table if not exists products (
  sku         text primary key,
  ean         text,
  name        text not null,
  family      text,
  category    text,
  updated_at  timestamptz not null default now()
);
create index if not exists products_ean_idx on products(ean);
create index if not exists products_family_idx on products(family);

-- ----------------------------------------------------------------------------
-- Plano de la tienda (imagen + dimensiones de referencia)
-- ----------------------------------------------------------------------------
create table if not exists store_layouts (
  store_id     uuid primary key references stores(id) on delete cascade,
  image_url    text,
  image_width  integer,
  image_height integer,
  updated_at   timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- Muebles (exhibidores). pin_x / pin_y en coordenadas normalizadas [0..1]
-- ----------------------------------------------------------------------------
create table if not exists fixtures (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  barcode     text not null,
  name        text not null,
  pin_x       real,
  pin_y       real,
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  unique (store_id, barcode)
);
create index if not exists fixtures_store_idx on fixtures(store_id);

-- ----------------------------------------------------------------------------
-- Sesiones de escaneo (una "foto" del mueble en una semana)
-- week en formato ISO 'IYYY-"W"IW' (ej. 2026-W26)
-- ----------------------------------------------------------------------------
create table if not exists scan_sessions (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  fixture_id  uuid not null references fixtures(id) on delete cascade,
  user_id     uuid references auth.users(id) on delete set null,
  week        text not null,
  scanned_at  timestamptz not null default now(),
  -- id estable generado en el cliente, para sync idempotente offline
  client_uid  text unique,
  created_at  timestamptz not null default now()
);
create index if not exists scan_sessions_store_week_idx on scan_sessions(store_id, week);
create index if not exists scan_sessions_fixture_idx on scan_sessions(fixture_id);

-- ----------------------------------------------------------------------------
-- Líneas de escaneo (SKU + cantidad dentro de una sesión)
-- ----------------------------------------------------------------------------
create table if not exists scan_lines (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references scan_sessions(id) on delete cascade,
  sku         text not null,
  quantity    integer not null check (quantity >= 0),
  unique (session_id, sku)
);
create index if not exists scan_lines_session_idx on scan_lines(session_id);
create index if not exists scan_lines_sku_idx on scan_lines(sku);

-- ----------------------------------------------------------------------------
-- Ventas importadas (POS/ERP) por (tienda, sku, semana)
-- ----------------------------------------------------------------------------
create table if not exists sales (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  sku         text not null,
  week        text not null,
  units       integer not null default 0,
  amount      numeric(14,2) not null default 0,
  unique (store_id, sku, week)
);
create index if not exists sales_store_week_idx on sales(store_id, week);

-- ----------------------------------------------------------------------------
-- Stock total por tienda y semana (para deducir almacén)
-- ----------------------------------------------------------------------------
create table if not exists store_stock (
  id           uuid primary key default gen_random_uuid(),
  store_id     uuid not null references stores(id) on delete cascade,
  sku          text not null,
  week         text not null,
  total_units  integer not null default 0,
  unique (store_id, sku, week)
);
create index if not exists store_stock_store_week_idx on store_stock(store_id, week);

-- ----------------------------------------------------------------------------
-- Resultado de atribución: venta adjudicada a un mueble
-- ----------------------------------------------------------------------------
create table if not exists sales_attribution (
  id          uuid primary key default gen_random_uuid(),
  store_id    uuid not null references stores(id) on delete cascade,
  fixture_id  uuid references fixtures(id) on delete cascade, -- NULL = "sin mueble"
  sku         text not null,
  week        text not null,
  units       integer not null default 0,
  amount      numeric(14,2) not null default 0,
  unique (store_id, week, sku)
);
create index if not exists sales_attr_fixture_week_idx on sales_attribution(fixture_id, week);

-- ----------------------------------------------------------------------------
-- Métricas agregadas por mueble y semana
-- ----------------------------------------------------------------------------
create table if not exists weekly_fixture_metrics (
  id              uuid primary key default gen_random_uuid(),
  store_id        uuid not null references stores(id) on delete cascade,
  fixture_id      uuid not null references fixtures(id) on delete cascade,
  week            text not null,
  units_sold      integer not null default 0,
  amount_sold     numeric(14,2) not null default 0,
  exposed_units   integer not null default 0,   -- stock expuesto (escaneado en el mueble)
  rotation        numeric(10,4),                -- units_sold / exposed_units
  unique (store_id, fixture_id, week)
);
create index if not exists wfm_fixture_idx on weekly_fixture_metrics(fixture_id, week);

-- ----------------------------------------------------------------------------
-- Trazabilidad de importaciones
-- ----------------------------------------------------------------------------
create table if not exists import_logs (
  id          uuid primary key default gen_random_uuid(),
  kind        text not null,           -- 'catalog' | 'sales' | 'stock'
  store_id    uuid references stores(id) on delete set null,
  week        text,
  rows_ok     integer not null default 0,
  rows_error  integer not null default 0,
  detail      jsonb,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

-- ============================================================================
-- Helpers de autorización
-- ============================================================================
create or replace function current_role_name()
returns user_role language sql stable security definer as $$
  select role from profiles where id = auth.uid();
$$;

create or replace function current_store_id()
returns uuid language sql stable security definer as $$
  select store_id from profiles where id = auth.uid();
$$;

-- ¿El usuario puede VER esta tienda?
create or replace function can_read_store(p_store uuid)
returns boolean language sql stable security definer as $$
  select case
    when current_role_name() in ('admin', 'analista') then true
    else p_store = current_store_id()
  end;
$$;

-- ¿El usuario puede ESCRIBIR en esta tienda?
create or replace function can_write_store(p_store uuid)
returns boolean language sql stable security definer as $$
  select case
    when current_role_name() = 'admin' then true
    when current_role_name() in ('visual', 'encargado', 'operario')
      then p_store = current_store_id()
    else false
  end;
$$;

-- ============================================================================
-- Row Level Security
-- ============================================================================
alter table stores                enable row level security;
alter table profiles              enable row level security;
alter table products              enable row level security;
alter table store_layouts         enable row level security;
alter table fixtures              enable row level security;
alter table scan_sessions         enable row level security;
alter table scan_lines            enable row level security;
alter table sales                 enable row level security;
alter table store_stock           enable row level security;
alter table sales_attribution     enable row level security;
alter table weekly_fixture_metrics enable row level security;
alter table import_logs           enable row level security;

-- stores
create policy stores_read on stores for select using (can_read_store(id));
create policy stores_write on stores for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- profiles: cada quien ve el suyo; admin ve todos
create policy profiles_read on profiles for select
  using (id = auth.uid() or current_role_name() = 'admin');
create policy profiles_admin_write on profiles for all
  using (current_role_name() = 'admin') with check (current_role_name() = 'admin');

-- products: lectura para autenticados; escritura admin
create policy products_read on products for select using (auth.uid() is not null);
create policy products_write on products for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- store_layouts: lectura por tienda; escritura admin o visual de la tienda
create policy layouts_read on store_layouts for select using (can_read_store(store_id));
create policy layouts_write on store_layouts for all
  using (current_role_name() = 'admin'
    or (current_role_name() = 'visual' and store_id = current_store_id()))
  with check (current_role_name() = 'admin'
    or (current_role_name() = 'visual' and store_id = current_store_id()));

-- fixtures: lectura por tienda; escritura admin o visual de la tienda
create policy fixtures_read on fixtures for select using (can_read_store(store_id));
create policy fixtures_write on fixtures for all
  using (current_role_name() = 'admin'
    or (current_role_name() = 'visual' and store_id = current_store_id()))
  with check (current_role_name() = 'admin'
    or (current_role_name() = 'visual' and store_id = current_store_id()));

-- scan_sessions / scan_lines: lectura por tienda; escritura por write-store
create policy sessions_read on scan_sessions for select using (can_read_store(store_id));
create policy sessions_write on scan_sessions for all
  using (can_write_store(store_id)) with check (can_write_store(store_id));

create policy lines_read on scan_lines for select using (
  exists (select 1 from scan_sessions s
          where s.id = scan_lines.session_id and can_read_store(s.store_id)));
create policy lines_write on scan_lines for all using (
  exists (select 1 from scan_sessions s
          where s.id = scan_lines.session_id and can_write_store(s.store_id)))
  with check (
  exists (select 1 from scan_sessions s
          where s.id = scan_lines.session_id and can_write_store(s.store_id)));

-- sales / store_stock / atribución / métricas: lectura por tienda; escritura admin
create policy sales_read on sales for select using (can_read_store(store_id));
create policy sales_write on sales for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy stock_read on store_stock for select using (can_read_store(store_id));
create policy stock_write on store_stock for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy attr_read on sales_attribution for select using (can_read_store(store_id));
create policy attr_write on sales_attribution for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

create policy wfm_read on weekly_fixture_metrics for select using (can_read_store(store_id));
create policy wfm_write on weekly_fixture_metrics for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- import_logs: lectura por tienda (o central); escritura admin
create policy imports_read on import_logs for select
  using (store_id is null and current_role_name() in ('admin','analista')
         or can_read_store(store_id));
create policy imports_write on import_logs for all using (current_role_name() = 'admin')
  with check (current_role_name() = 'admin');

-- ============================================================================
-- Trigger: crear profile al registrarse un usuario
-- ============================================================================
create or replace function handle_new_user()
returns trigger language plpgsql security definer as $$
begin
  insert into profiles (id, full_name)
  values (new.id, new.raw_user_meta_data->>'full_name')
  on conflict (id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
