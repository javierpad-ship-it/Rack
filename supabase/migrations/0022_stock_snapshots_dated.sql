-- ============================================================================
-- 0022 — Stock por fecha de foto (para guardar el cierre de mes)
--
-- La carga de stock ahora se marca con la FECHA de la foto (elegida en la UI).
-- Se guarda cada foto en stock_snapshots(store, sku, snapshot_date) para poder
-- conservar el cierre de mes y calcular reportes mensuales. stock_current sigue
-- siendo la foto vigente (la última cargada) para el almacén de la semana.
-- ============================================================================

create table if not exists stock_snapshots (
  store_id      uuid not null references stores(id) on delete cascade,
  sku           text not null,
  snapshot_date date not null,
  units         integer not null default 0,       -- Stk Fin Act
  value         numeric(14,2) not null default 0, -- Stk Val Act
  cost          numeric(14,2) not null default 0, -- Costo Prom
  article_code  text,
  description   text,
  group_name    text,
  sap_line      text,
  gender        text,
  color         text,
  talla         text,
  brand         text,
  arrival_year  text,
  classification text,
  updated_at    timestamptz not null default now(),
  primary key (store_id, sku, snapshot_date)
);
create index if not exists stock_snapshots_store_date_idx on stock_snapshots(store_id, snapshot_date);

alter table stock_snapshots enable row level security;
drop policy if exists stock_snapshots_read on stock_snapshots;
create policy stock_snapshots_read on stock_snapshots for select
  using (auth.role() = 'authenticated');

-- Refresca store_stock de la semana comercial de la FECHA de la foto con las
-- unidades de esa foto (para el almacén deducido y los reportes de esa semana).
create or replace function apply_stock_snapshot(p_store_id uuid, p_date date)
returns void language plpgsql security definer as $$
declare v_week text := comm_week(p_date);
begin
  delete from store_stock where store_id = p_store_id and week = v_week;
  insert into store_stock (store_id, sku, week, total_units)
  select store_id, sku, v_week, units
  from stock_snapshots
  where store_id = p_store_id and snapshot_date = p_date;
end $$;

-- Fecha de la última foto de stock de una tienda dentro de un mes 'YYYY-MM'
-- (el cierre de mes = la foto más reciente de ese mes).
create or replace function month_end_stock_date(p_store_id uuid, p_month text)
returns date language sql stable security definer as $$
  select max(snapshot_date)
  from stock_snapshots
  where store_id = p_store_id
    and to_char(snapshot_date, 'YYYY-MM') = p_month;
$$;
