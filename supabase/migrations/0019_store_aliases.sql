-- ============================================================================
-- 0019 — Mapeo de tiendas: nombre en el archivo de ventas/stock -> tienda Rack
--
-- El feed de ventas/stock (QlikView) trae una columna TIENDA con el nombre tal
-- como lo conoce el POS (ej. "LUKERS ALFONSO UGARTE"), que no necesariamente
-- coincide con el nombre/código que se usa en Rack One. `store_aliases`
-- resuelve esa diferencia: un archivo con TODAS las tiendas se reparte solo,
-- fila por fila, según este mapeo (mantenimiento manual, vía web/admin).
--
-- El alias se guarda normalizado (trim + mayúsculas) para que la búsqueda no
-- dependa de mayúsculas/espacios exactos.
-- ============================================================================

create table if not exists store_aliases (
  alias       text primary key,   -- normalizado: trim + upper
  store_id    uuid not null references stores(id) on delete cascade,
  created_at  timestamptz not null default now()
);
create index if not exists store_aliases_store_idx on store_aliases(store_id);

alter table store_aliases enable row level security;
drop policy if exists store_aliases_read on store_aliases;
create policy store_aliases_read on store_aliases for select using (auth.uid() is not null);
-- Escritura solo vía service-role (Server Actions, rol admin) — sin policy de write para clientes.
