-- ============================================================================
-- Test manual de la lógica de atribución (regla "primer mueble").
-- Ejecutar contra una base con las migraciones aplicadas:
--   psql "$DATABASE_URL" -f supabase/tests/attribution_test.sql
-- Corre dentro de una transacción que se revierte al final (no deja datos).
-- ============================================================================
begin;

-- Datos de prueba
insert into stores (id, code, name)
values ('00000000-0000-0000-0000-0000000000aa', 'T1', 'Tienda Test');

insert into products (sku, name) values
  ('SKU1', 'Producto 1'),
  ('SKU2', 'Producto 2');

insert into fixtures (id, store_id, barcode, name) values
  ('00000000-0000-0000-0000-0000000000f1', '00000000-0000-0000-0000-0000000000aa', 'M1', 'Mueble 1'),
  ('00000000-0000-0000-0000-0000000000f2', '00000000-0000-0000-0000-0000000000aa', 'M2', 'Mueble 2');

-- SKU1 está en M1 (escaneado primero) y en M2 (después) la misma semana.
-- SKU2 solo en M2.
insert into scan_sessions (id, store_id, fixture_id, week, scanned_at) values
  ('00000000-0000-0000-0000-0000000000s1', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-0000000000f1', '2026-W26', '2026-06-22 09:00:00+00'),
  ('00000000-0000-0000-0000-0000000000s2', '00000000-0000-0000-0000-0000000000aa',
   '00000000-0000-0000-0000-0000000000f2', '2026-W26', '2026-06-22 11:00:00+00');

insert into scan_lines (session_id, sku, quantity) values
  ('00000000-0000-0000-0000-0000000000s1', 'SKU1', 10),
  ('00000000-0000-0000-0000-0000000000s2', 'SKU1', 4),
  ('00000000-0000-0000-0000-0000000000s2', 'SKU2', 6);

insert into sales (store_id, sku, week, units, amount) values
  ('00000000-0000-0000-0000-0000000000aa', 'SKU1', '2026-W26', 7, 700),
  ('00000000-0000-0000-0000-0000000000aa', 'SKU2', '2026-W26', 3, 300);

-- Ejecutar atribución
select attribute_sales('00000000-0000-0000-0000-0000000000aa', '2026-W26');

-- ---- Asserts ----
do $$
declare
  v_fixture uuid;
  v_rotation numeric;
begin
  -- SKU1 debe quedar adjudicado a M1 (primer mueble escaneado).
  select fixture_id into v_fixture
  from sales_attribution
  where sku = 'SKU1' and week = '2026-W26';
  if v_fixture <> '00000000-0000-0000-0000-0000000000f1' then
    raise exception 'FALLO: SKU1 debía ir a Mueble 1, fue a %', v_fixture;
  end if;

  -- SKU2 debe quedar adjudicado a M2.
  select fixture_id into v_fixture
  from sales_attribution
  where sku = 'SKU2' and week = '2026-W26';
  if v_fixture <> '00000000-0000-0000-0000-0000000000f2' then
    raise exception 'FALLO: SKU2 debía ir a Mueble 2, fue a %', v_fixture;
  end if;

  -- Rotación de M1 = 7 vendidas / 10 expuestas = 0.7
  select rotation into v_rotation
  from weekly_fixture_metrics
  where fixture_id = '00000000-0000-0000-0000-0000000000f1' and week = '2026-W26';
  if round(v_rotation, 2) <> 0.70 then
    raise exception 'FALLO: rotación M1 esperada 0.70, fue %', v_rotation;
  end if;

  raise notice 'OK: atribución y métricas correctas.';
end $$;

-- Almacén deducido para SKU1: si stock total = 20, piso = 10 + 4 = 14, almacén = 6.
insert into store_stock (store_id, sku, week, total_units)
values ('00000000-0000-0000-0000-0000000000aa', 'SKU1', '2026-W26', 20);

do $$
declare v_wh int;
begin
  select warehouse_units into v_wh
  from store_warehouse('00000000-0000-0000-0000-0000000000aa', '2026-W26')
  where sku = 'SKU1';
  if v_wh <> 6 then
    raise exception 'FALLO: almacén SKU1 esperado 6, fue %', v_wh;
  end if;
  raise notice 'OK: almacén deducido correcto.';
end $$;

rollback;
