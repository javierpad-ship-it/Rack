-- ============================================================================
-- 0046 — Prisma: historial de precios por (genérico, Org.Ventas)
--
-- `generic_prices` es un historial **append-only**: cada cambio de PVP agrega
-- una fila. Así se puede analizar la evolución del precio vs rotación/agotamiento.
--   - PVP vigente  = la fila válida hoy (mayor valid_from con valid_to null/≥hoy).
--   - PVP anterior = la fila válida inmediatamente anterior.
--   - Fecha de cambio = valid_from del vigente.
-- La 1ª importación (archivo "PVP Rack One") siembra vigente + anterior desde
-- PVP / PVP_ANTERIOR / FECHA_CAMBIO_PVP; las cargas siguientes agregan una fila
-- por cada cambio real. El archivo de carga SAP (Material + Org + validez) usa la
-- misma tabla. `source` distingue el origen.
-- ============================================================================

create table if not exists generic_prices (
  id           bigint generated always as identity primary key,
  generic_code text not null,                 -- Material (CODIGO_GENERICO)
  sales_org    text not null,                 -- R050 / R040
  pvp          numeric(12,2) not null,        -- Precio Vta. Público
  valid_from   date not null default current_date,
  valid_to     date,                          -- null = vigente (abierto)
  source       text,                          -- 'pvp_rackone' | 'sap_load' | 'proposal'
  created_at   timestamptz not null default now(),
  unique (generic_code, sales_org, valid_from)
);
create index if not exists generic_prices_lookup_idx
  on generic_prices(generic_code, sales_org, valid_from desc);

alter table generic_prices enable row level security;
drop policy if exists generic_prices_read on generic_prices;
create policy generic_prices_read on generic_prices for select
  using (auth.uid() is not null);

-- Precio vigente + anterior + fecha de cambio + mini-historial para un
-- (genérico, Org). Todo en JSON para que Prisma lo consuma directo.
create or replace function generic_price_info(p_generic text, p_org text)
returns json language sql stable as $$
  with ordered as (
    select pvp, valid_from,
           row_number() over (order by valid_from desc, id desc) as rn
    from generic_prices
    where generic_code = p_generic
      and (p_org is null or sales_org = p_org)
      and valid_from <= current_date
  )
  select json_build_object(
    'pvp_vigente',   (select pvp        from ordered where rn = 1),
    'fecha_cambio',  (select valid_from from ordered where rn = 1),
    'pvp_anterior',  (select pvp        from ordered where rn = 2),
    'historial', coalesce((
      select json_agg(json_build_object('pvp', pvp, 'desde', valid_from) order by valid_from desc)
      from ordered where rn <= 6
    ), '[]'::json)
  );
$$;
