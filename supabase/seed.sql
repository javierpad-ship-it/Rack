-- ============================================================================
-- Datos de demo para probar Rack de punta a punta.
-- Ejecutar DESPUÉS de las migraciones y de crear al menos un usuario admin.
--   psql "$DATABASE_URL" -f supabase/seed.sql
-- Idempotente: usa IDs fijos y ON CONFLICT.
-- ============================================================================

-- Tienda demo
insert into stores (id, code, name) values
  ('11111111-1111-1111-1111-111111111111', 'DEMO', 'Tienda Demo')
on conflict (id) do nothing;

-- Catálogo
insert into products (sku, ean, name, family) values
  ('SKU-100', '7790000000100', 'Remera básica',   'Indumentaria'),
  ('SKU-101', '7790000000101', 'Pantalón jean',    'Indumentaria'),
  ('SKU-200', '7790000000200', 'Taza cerámica',    'Bazar'),
  ('SKU-201', '7790000000201', 'Vaso vidrio x6',   'Bazar')
on conflict (sku) do update set name = excluded.name, family = excluded.family;

-- Muebles con pines en el plano (coordenadas normalizadas)
insert into fixtures (id, store_id, barcode, name, pin_x, pin_y) values
  ('aaaaaaaa-0000-0000-0000-0000000000a1', '11111111-1111-1111-1111-111111111111', 'MUE-001', 'Góndola entrada', 0.20, 0.30),
  ('aaaaaaaa-0000-0000-0000-0000000000a2', '11111111-1111-1111-1111-111111111111', 'MUE-002', 'Isla central',    0.55, 0.50),
  ('aaaaaaaa-0000-0000-0000-0000000000a3', '11111111-1111-1111-1111-111111111111', 'MUE-003', 'Pared fondo',     0.80, 0.75)
on conflict (id) do nothing;

-- Escaneo semana 2026-W26 (SKU-100 está en góndola entrada e isla central; isla escaneada después)
insert into scan_sessions (id, store_id, fixture_id, week, scanned_at, client_uid) values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a1', '2026-W26', '2026-06-22 09:00:00+00', 'seed-b1'),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a2', '2026-W26', '2026-06-22 10:30:00+00', 'seed-b2'),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', '11111111-1111-1111-1111-111111111111', 'aaaaaaaa-0000-0000-0000-0000000000a3', '2026-W26', '2026-06-22 11:00:00+00', 'seed-b3')
on conflict (client_uid) do nothing;

insert into scan_lines (session_id, sku, quantity) values
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'SKU-100', 12),
  ('bbbbbbbb-0000-0000-0000-0000000000b1', 'SKU-101', 8),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'SKU-100', 5),
  ('bbbbbbbb-0000-0000-0000-0000000000b2', 'SKU-200', 20),
  ('bbbbbbbb-0000-0000-0000-0000000000b3', 'SKU-201', 15)
on conflict (session_id, sku) do update set quantity = excluded.quantity;

-- Ventas de la semana
insert into sales (store_id, sku, week, units, amount) values
  ('11111111-1111-1111-1111-111111111111', 'SKU-100', '2026-W26', 9,  18000),
  ('11111111-1111-1111-1111-111111111111', 'SKU-101', '2026-W26', 3,  21000),
  ('11111111-1111-1111-1111-111111111111', 'SKU-200', '2026-W26', 14, 14000),
  ('11111111-1111-1111-1111-111111111111', 'SKU-201', '2026-W26', 6,  9000)
on conflict (store_id, sku, week) do update set units = excluded.units, amount = excluded.amount;

-- Stock total (para deducir almacén)
insert into store_stock (store_id, sku, week, total_units) values
  ('11111111-1111-1111-1111-111111111111', 'SKU-100', '2026-W26', 30),
  ('11111111-1111-1111-1111-111111111111', 'SKU-101', '2026-W26', 12),
  ('11111111-1111-1111-1111-111111111111', 'SKU-200', '2026-W26', 25),
  ('11111111-1111-1111-1111-111111111111', 'SKU-201', '2026-W26', 18)
on conflict (store_id, sku, week) do update set total_units = excluded.total_units;

-- Calcular atribución y métricas para la semana
select attribute_sales('11111111-1111-1111-1111-111111111111', '2026-W26');

-- Resultado esperado: SKU-100 atribuido a 'Góndola entrada' (primer mueble escaneado).
