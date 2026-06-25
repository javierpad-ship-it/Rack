-- ============================================================================
-- 0011 — Pisos por tienda y código de mueble estructurado
--
-- Reglas de negocio:
--   * Cada tienda define cuántos pisos tiene (stores.floors).
--   * Cada mueble pertenece a un piso (fixtures.floor).
--   * El código del mueble (barcode) = código de tienda + piso + nº de 4 dígitos
--     correlativo por (tienda, piso). Ej: tienda "BR", piso 2, 3er mueble => "BR20003".
--   * Si se inserta un mueble sin barcode, el trigger lo genera automáticamente.
--     Si se provee uno (p. ej. import de etiquetas existentes), se respeta.
-- ============================================================================

-- Tiendas: número de pisos --------------------------------------------------
alter table stores
  add column if not exists floors int not null default 1;

alter table stores
  drop constraint if exists stores_floors_chk;
alter table stores
  add constraint stores_floors_chk check (floors >= 1 and floors <= 50);

-- Muebles: piso -------------------------------------------------------------
alter table fixtures
  add column if not exists floor int not null default 1;

alter table fixtures
  drop constraint if exists fixtures_floor_chk;
alter table fixtures
  add constraint fixtures_floor_chk check (floor >= 1);

create index if not exists fixtures_store_floor_idx on fixtures(store_id, floor);

-- Generación automática del código -----------------------------------------
create or replace function fixtures_set_code()
returns trigger language plpgsql as $$
declare
  s_code text;
  next_seq int;
begin
  if new.floor is null or new.floor < 1 then
    new.floor := 1;
  end if;

  -- Solo autogenerar si no vino un código explícito.
  if new.barcode is null or btrim(new.barcode) = '' then
    select code into s_code from stores where id = new.store_id;
    if s_code is null then
      raise exception 'Tienda inexistente para el mueble';
    end if;

    -- Correlativo: mayor número de 4 dígitos usado en esa tienda+piso + 1.
    select coalesce(
             max(nullif(regexp_replace(right(barcode, 4), '\D', '', 'g'), '')::int),
             0
           ) + 1
      into next_seq
      from fixtures
     where store_id = new.store_id and floor = new.floor;

    new.barcode := s_code || new.floor::text || lpad(next_seq::text, 4, '0');
  end if;

  return new;
end $$;

drop trigger if exists fixtures_code on fixtures;
create trigger fixtures_code
  before insert on fixtures
  for each row execute function fixtures_set_code();
