-- ============================================================================
-- Test de la proyección mensual (fixture_monthly_metrics).
--   psql "$DATABASE_URL" -f supabase/tests/monthly_test.sql
-- Valida: atribución por ÚLTIMO mueble del mes, MTD, y proyección lineal por días.
-- Corre en transacción y revierte. Usa un mes PASADO (proyección = mes completo).
-- ============================================================================
begin;

insert into stores (id, code, name)
values ('00000000-0000-0000-0000-0000000000bb', 'TM', 'Tienda Mensual');

insert into products (sku, name) values ('MK1', 'Producto Mensual 1');

insert into fixtures (id, store_id, barcode, name) values
  ('00000000-0000-0000-0000-0000000000g1', '00000000-0000-0000-0000-0000000000bb', 'GM1', 'Mueble A'),
  ('00000000-0000-0000-0000-0000000000g2', '00000000-0000-0000-0000-0000000000bb', 'GM2', 'Mueble B');

-- Enero 2026: semana 2026-W02 (jueves 2026-01-08) y 2026-W03 (jueves 2026-01-15), ambas de enero.
-- MK1 se escanea primero en Mueble A (W02) y luego en Mueble B (W03) => último = Mueble B.
insert into scan_sessions (id, store_id, fixture_id, week, scanned_at) values
  ('00000000-0000-0000-0000-0000000000h1', '00000000-0000-0000-0000-0000000000bb',
   '00000000-0000-0000-0000-0000000000g1', '2026-W02', '2026-01-06 10:00:00+00'),
  ('00000000-0000-0000-0000-0000000000h2', '00000000-0000-0000-0000-0000000000bb',
   '00000000-0000-0000-0000-0000000000g2', '2026-W03', '2026-01-13 10:00:00+00');

insert into scan_lines (session_id, sku, quantity) values
  ('00000000-0000-0000-0000-0000000000h1', 'MK1', 10),
  ('00000000-0000-0000-0000-0000000000h2', 'MK1', 5);

-- Venta del mes: 20 u en W02 + 11 u en W03 = 31 u acumuladas en enero.
insert into sales (store_id, sku, week, units, amount) values
  ('00000000-0000-0000-0000-0000000000bb', 'MK1', '2026-W02', 20, 2000),
  ('00000000-0000-0000-0000-0000000000bb', 'MK1', '2026-W03', 11, 1100);

do $$
declare
  v_fixture text;
  v_proj numeric;
  v_mtd int;
begin
  -- La venta del mes debe atribuirse a Mueble B (último escaneo).
  select fixture_name, mtd_units, projected_units
    into v_fixture, v_mtd, v_proj
  from fixture_monthly_metrics('00000000-0000-0000-0000-0000000000bb', '2026-01')
  where mtd_units > 0;

  if v_fixture <> 'Mueble B' then
    raise exception 'FALLO: la venta mensual debía ir a Mueble B (último), fue a %', v_fixture;
  end if;
  if v_mtd <> 31 then
    raise exception 'FALLO: MTD esperado 31, fue %', v_mtd;
  end if;
  -- Mes pasado => proyección = mes completo = MTD = 31.
  if round(v_proj) <> 31 then
    raise exception 'FALLO: proyección esperada 31 (mes completo), fue %', v_proj;
  end if;

  raise notice 'OK: proyección mensual correcta (% , MTD=%, proy=%).', v_fixture, v_mtd, v_proj;
end $$;

-- Verifica el anclaje semana->mes por jueves.
do $$
begin
  if iso_week_thursday('2026-W02') <> date '2026-01-08' then
    raise exception 'FALLO: jueves de 2026-W02 esperado 2026-01-08, fue %', iso_week_thursday('2026-W02');
  end if;
  raise notice 'OK: anclaje semana->mes por jueves correcto.';
end $$;

rollback;
