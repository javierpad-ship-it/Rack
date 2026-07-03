-- ============================================================================
-- 0020 — Plano por piso: una imagen de plano por (tienda, piso)
--
-- Hasta ahora store_layouts tenía la tienda como PK (un solo plano por tienda),
-- pero los muebles ya viven en pisos (fixtures.floor, 0011). Las tiendas de
-- varios pisos necesitan subir un plano por piso y ubicar en cada uno solo sus
-- muebles. Se agrega store_layouts.floor y la PK pasa a (store_id, floor).
-- El plano existente de cada tienda queda como piso 1.
-- ============================================================================

alter table store_layouts add column if not exists floor int not null default 1;

alter table store_layouts drop constraint if exists store_layouts_floor_chk;
alter table store_layouts add constraint store_layouts_floor_chk check (floor >= 1);

-- Recompone la clave primaria: de (store_id) a (store_id, floor).
alter table store_layouts drop constraint if exists store_layouts_pkey;
alter table store_layouts add primary key (store_id, floor);
