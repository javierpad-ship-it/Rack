-- ============================================================================
-- 0016 — Stock vigente por variante (la carga reemplaza la foto anterior)
--
-- El POS exporta la foto de stock actual por (tienda, variante) con unidades,
-- valor y costo promedio. Cada carga REEMPLAZA el stock anterior de la tienda.
-- Se guarda el detalle en `stock_current` y, para el "almacén deducido"
-- (almacén = stock − escaneado en piso), se refresca store_stock de la semana
-- vigente con las unidades de la foto.
-- ============================================================================

create table if not exists stock_current (
  store_id     uuid not null references stores(id) on delete cascade,
  sku          text not null,             -- CODIGO_VARIANTE
  units        integer not null default 0,-- Stk Fin Act
  value        numeric(14,2) not null default 0, -- Stk Val Act
  cost         numeric(14,2) not null default 0, -- Costo Prom
  article_code text,                       -- CODIGO_ARTICULO
  description  text,
  group_name   text,                       -- GRUPO_PRODUCTO
  sap_line     text,                       -- LINEA SAP
  gender       text,                       -- Género Lukers
  color        text,
  talla        text,
  brand        text,                       -- MARCA
  arrival_year text,                       -- ANIO_LLEGADA_LK
  updated_at   timestamptz not null default now(),
  primary key (store_id, sku)
);
create index if not exists stock_current_store_idx on stock_current(store_id);

alter table stock_current enable row level security;
drop policy if exists stock_current_read on stock_current;
create policy stock_current_read on stock_current for select
  using (auth.role() = 'authenticated');

-- Refresca store_stock de la semana vigente con las unidades de la foto actual,
-- para que el almacén deducido use el stock recién cargado.
create or replace function apply_stock_snapshot(p_store_id uuid)
returns void language plpgsql security definer as $$
declare v_week text := comm_week(now());
begin
  delete from store_stock where store_id = p_store_id and week = v_week;
  insert into store_stock (store_id, sku, week, total_units)
  select store_id, sku, v_week, units from stock_current where store_id = p_store_id;
end $$;
