-- ============================================================================
-- 0038 — Canonizar SKU sin ceros a la izquierda (ventas, stock y ESCANEO)
--
-- El POS y el escáner exportan el CODIGO_VARIANTE con padding de ceros
-- (000001000000358024) de forma inconsistente: algunas cargas quedaron con
-- ceros y otras sin ellos, y el escaneo del equipo llega con ceros. Eso rompe
-- el cruce venta/stock/piso (todo cae en "(sin responsable)").
--
-- norm_sku() quita los ceros a la izquierda en códigos numéricos (igual que
-- normSku() del web). Se normaliza la data existente y se agrega un TRIGGER en
-- scan_lines para que el escaneo del equipo se canonice solo al sincronizar.
-- ============================================================================

create or replace function norm_sku(v text)
returns text language sql immutable as $$
  select case when v ~ '^[0-9]+$' then coalesce(nullif(ltrim(v, '0'), ''), '0') else v end;
$$;

-- Normaliza la data ya cargada (solo toca filas con padding; injective por
-- longitud fija del código, no colisiona). sales_daily/sales ya suelen estar
-- sin ceros → no-op.
update scan_lines      set sku = norm_sku(sku) where sku <> norm_sku(sku);
update stock_snapshots set sku = norm_sku(sku) where sku <> norm_sku(sku);
update stock_current   set sku = norm_sku(sku) where sku <> norm_sku(sku);
update sales_daily     set sku = norm_sku(sku) where sku <> norm_sku(sku);
update sales           set sku = norm_sku(sku) where sku <> norm_sku(sku);
update sales_attribution set sku = norm_sku(sku) where sku <> norm_sku(sku);

-- Trigger: el escaneo del equipo llega con ceros; se canoniza al insertar/actualizar.
create or replace function scan_lines_norm_sku()
returns trigger language plpgsql as $$
begin
  new.sku := norm_sku(new.sku);
  return new;
end $$;

drop trigger if exists trg_scan_lines_norm_sku on scan_lines;
create trigger trg_scan_lines_norm_sku
  before insert or update on scan_lines
  for each row execute function scan_lines_norm_sku();
