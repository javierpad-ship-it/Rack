-- ============================================================================
-- 0013 — Ventas diarias (feed crudo) + recomputo del agregado semanal
--
-- El POS exporta ventas por (tienda, artículo, variante, día) con cantidad,
-- importe y margen. Guardamos ese detalle en `sales_daily` (histórico ~24
-- meses) y, a partir de él, recalculamos el agregado semanal `sales`
-- (store, sku, week) que ya usan la atribución por mueble y los reportes.
--
-- `sku` = CODIGO_VARIANTE (lo que cruza con el escaneo). Guardamos además
-- article_code/description/grupo/línea/género para enriquecer reportes.
-- ============================================================================

create table if not exists sales_daily (
  id           bigint generated always as identity primary key,
  store_id     uuid not null references stores(id) on delete cascade,
  sale_date    date not null,
  sku          text not null,             -- CODIGO_VARIANTE
  article_code text,                      -- CODIGO_ARTICULO
  description  text,
  group_name   text,                      -- GRUPO_PRODUCTO
  sap_line     text,                      -- LINEA SAP
  gender       text,                      -- Género Lukers
  units        integer not null default 0,
  amount       numeric(14,2) not null default 0,
  margin       numeric(14,2) not null default 0,
  created_at   timestamptz not null default now(),
  unique (store_id, sku, sale_date)
);
create index if not exists sales_daily_store_date_idx on sales_daily(store_id, sale_date);
create index if not exists sales_daily_sku_idx on sales_daily(sku);

-- Recalcula `sales` (store, sku, week) desde sales_daily para una semana ISO
-- puntual y dispara la atribución por mueble de esa semana.
create or replace function recompute_sales_week(p_store_id uuid, p_week text)
returns void language plpgsql security definer as $$
begin
  delete from sales where store_id = p_store_id and week = p_week;

  insert into sales (store_id, sku, week, units, amount)
  select store_id, sku, p_week, sum(units)::int, sum(amount)
  from sales_daily
  where store_id = p_store_id
    and iso_week(sale_date::timestamptz) = p_week
  group by store_id, sku;

  perform attribute_sales(p_store_id, p_week);
end $$;

-- Helper: recalcula todas las semanas afectadas por un rango de fechas.
create or replace function recompute_sales_range(p_store_id uuid, p_from date, p_to date)
returns void language plpgsql security definer as $$
declare w text;
begin
  for w in
    select distinct iso_week(sale_date::timestamptz)
    from sales_daily
    where store_id = p_store_id and sale_date between p_from and p_to
  loop
    perform recompute_sales_week(p_store_id, w);
  end loop;
end $$;
