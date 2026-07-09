-- ============================================================================
-- 0052 — generic_price_info robusto cuando p_org es null
--
-- Mientras las tiendas no tengan `sales_org` asignado, la ficha consulta el
-- precio con p_org = null y hace match con TODAS las Orgs. Si R050 y R040 tienen
-- el mismo precio para una fecha, aparecían filas duplicadas y el "PVP anterior"
-- salía repetido. Se colapsan las Orgs por `valid_from` (distinct on) antes de
-- rankear vigente/anterior.
-- ============================================================================

create or replace function generic_price_info(p_generic text, p_org text)
returns json language sql stable as $$
  with dedup as (
    select distinct on (valid_from) pvp, valid_from
    from generic_prices
    where generic_code = p_generic
      and (p_org is null or sales_org = p_org)
      and valid_from <= current_date
    order by valid_from, id desc
  ),
  ordered as (
    select pvp, valid_from, row_number() over (order by valid_from desc) as rn
    from dedup
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
