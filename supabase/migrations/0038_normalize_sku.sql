-- ============================================================================
-- 0038 — Canonizar SKU sin ceros a la izquierda (ventas, stock y ESCANEO)
--
-- El POS y el escáner exportan el CODIGO_VARIANTE con padding de ceros
-- (000001000000358024) de forma inconsistente: algunas cargas quedaron con
-- ceros y otras sin ellos, y el escaneo del equipo llega con ceros. Eso rompe
-- el cruce venta/stock/piso (todo cae en "(sin responsable)").
--
-- norm_sku() quita los ceros a la izquierda en códigos numéricos (igual que
-- normSku() del web). Se normaliza la data existente FUSIONANDO duplicados que
-- colapsan al mismo SKU (sumando medidas), para no violar las claves únicas.
-- Un TRIGGER en scan_lines canoniza el escaneo del equipo al sincronizar.
-- ============================================================================

create or replace function norm_sku(v text)
returns text language sql immutable as $$
  select case when v ~ '^[0-9]+$' then coalesce(nullif(ltrim(v, '0'), ''), '0') else v end;
$$;

-- scan_lines: único (session_id, sku)
with n as (select ctid, sum(quantity) over w s,
                  row_number() over (partition by session_id, norm_sku(sku) order by ctid) rn
           from scan_lines window w as (partition by session_id, norm_sku(sku)))
update scan_lines t set quantity = n.s from n where t.ctid = n.ctid and n.rn = 1;
with n as (select ctid, row_number() over (partition by session_id, norm_sku(sku) order by ctid) rn from scan_lines)
delete from scan_lines t using n where t.ctid = n.ctid and n.rn > 1;
update scan_lines set sku = norm_sku(sku) where sku <> norm_sku(sku);

-- stock_snapshots: PK (store_id, sku, snapshot_date)
with n as (select ctid, sum(units) over w u, sum(value) over w v, sum(cost) over w c,
                  row_number() over (partition by store_id, snapshot_date, norm_sku(sku) order by ctid) rn
           from stock_snapshots window w as (partition by store_id, snapshot_date, norm_sku(sku)))
update stock_snapshots t set units=n.u, value=n.v, cost=n.c from n where t.ctid=n.ctid and n.rn=1;
with n as (select ctid, row_number() over (partition by store_id, snapshot_date, norm_sku(sku) order by ctid) rn from stock_snapshots)
delete from stock_snapshots t using n where t.ctid=n.ctid and n.rn>1;
update stock_snapshots set sku = norm_sku(sku) where sku <> norm_sku(sku);

-- stock_current: PK (store_id, sku)
with n as (select ctid, sum(units) over w u, sum(value) over w v, sum(cost) over w c,
                  row_number() over (partition by store_id, norm_sku(sku) order by ctid) rn
           from stock_current window w as (partition by store_id, norm_sku(sku)))
update stock_current t set units=n.u, value=n.v, cost=n.c from n where t.ctid=n.ctid and n.rn=1;
with n as (select ctid, row_number() over (partition by store_id, norm_sku(sku) order by ctid) rn from stock_current)
delete from stock_current t using n where t.ctid=n.ctid and n.rn>1;
update stock_current set sku = norm_sku(sku) where sku <> norm_sku(sku);

-- sales_daily: PK (store_id, sku, sale_date)
with n as (select ctid, sum(units) over w u, sum(amount) over w a, sum(margin) over w m,
                  row_number() over (partition by store_id, sale_date, norm_sku(sku) order by ctid) rn
           from sales_daily window w as (partition by store_id, sale_date, norm_sku(sku)))
update sales_daily t set units=n.u, amount=n.a, margin=n.m from n where t.ctid=n.ctid and n.rn=1;
with n as (select ctid, row_number() over (partition by store_id, sale_date, norm_sku(sku) order by ctid) rn from sales_daily)
delete from sales_daily t using n where t.ctid=n.ctid and n.rn>1;
update sales_daily set sku = norm_sku(sku) where sku <> norm_sku(sku);

-- sales: PK (store_id, sku, week)
with n as (select ctid, sum(units) over w u, sum(amount) over w a,
                  row_number() over (partition by store_id, week, norm_sku(sku) order by ctid) rn
           from sales window w as (partition by store_id, week, norm_sku(sku)))
update sales t set units=n.u, amount=n.a from n where t.ctid=n.ctid and n.rn=1;
with n as (select ctid, row_number() over (partition by store_id, week, norm_sku(sku) order by ctid) rn from sales)
delete from sales t using n where t.ctid=n.ctid and n.rn>1;
update sales set sku = norm_sku(sku) where sku <> norm_sku(sku);

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
