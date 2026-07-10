-- ============================================================================
-- 0056 — Precios por (genérico, EMPRESA) — reemplaza sales_org como clave de
--         consulta en Prisma
--
-- El import de PVP pasa a traer EMPRESA (no Org. de Ventas). Se agrega
-- generic_prices.empresa_id; sales_org queda para compatibilidad histórica
-- (deja de ser obligatorio). generic_price_info_empresa() es el lookup nuevo
-- por empresa; prisma_variant_lookup() se actualiza para resolver la empresa
-- de la tienda y usarla al mostrar el PVP.
-- ============================================================================

alter table generic_prices alter column sales_org drop not null;
alter table generic_prices add column if not exists empresa_id uuid references empresas(id) on delete cascade;

-- Índice único (sirve como target de ON CONFLICT, igual que una constraint) para
-- poder hacer upsert con onConflict='generic_code,empresa_id,valid_from' desde
-- el import. `add constraint ... if not exists` no existe en Postgres; se usa
-- un unique index, que ON CONFLICT acepta igual.
create unique index if not exists generic_prices_empresa_unique
  on generic_prices(generic_code, empresa_id, valid_from);

-- Precio vigente + anterior + fecha de cambio + mini-historial para un
-- (genérico, empresa). Misma forma que generic_price_info() pero por empresa.
create or replace function generic_price_info_empresa(p_generic text, p_empresa uuid)
returns json language sql stable as $$
  with ordered as (
    select pvp, valid_from,
           row_number() over (order by valid_from desc, id desc) as rn
    from generic_prices
    where generic_code = p_generic
      and empresa_id = p_empresa
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

-- prisma_variant_lookup: resuelve la empresa de la tienda y muestra su PVP.
-- Se agrega 'empresa_id'/'empresa_nombre' al resultado; 'sales_org' se conserva
-- (histórico, ya no determina el precio).
create or replace function prisma_variant_lookup(
  p_store_id uuid,
  p_sku      text,
  p_days     int default 30
) returns json
language plpgsql stable security definer as $$
declare
  v_sku      text := norm_sku(p_sku);
  v_week     text := comm_week(now());
  v_org      text;
  v_empresa  uuid;
  v_emp_name text;
  v_generic  text;
  v_snap     date;
  v_result   json;
begin
  select sales_org, empresa_id into v_org, v_empresa from stores where id = p_store_id;
  select coalesce(nombre_reporte, nombre) into v_emp_name from empresas where id = v_empresa;
  v_generic := generic_of_sku(v_sku);
  select max(snapshot_date) into v_snap from stock_snapshots where sku = v_sku;

  with sw as (
    select sku, total_units, floor_units, warehouse_units
    from store_warehouse(p_store_id, v_week)
  ),
  s30 as (
    select sku, sum(units)::int as u
    from sales_daily
    where store_id = p_store_id and sale_date > current_date - p_days
    group by sku
  ),
  -- dims de la variante escaneada
  vdim as (
    select sc.sku, sc.article_code, sc.generic_code, sc.description, sc.group_name,
           sc.gender, sc.color, sc.talla, sc.brand, sc.units as stock
    from stock_current sc
    where sc.store_id = p_store_id and sc.sku = v_sku
    limit 1
  ),
  -- filas del genérico en esta tienda (para el detalle por color)
  gen as (
    select sc.color, sc.talla, sc.sku, sc.units as stock,
           coalesce(sw.floor_units, 0) as piso,
           coalesce(sw.warehouse_units, greatest(sc.units - coalesce(sw.floor_units,0), 0)) as almacen,
           coalesce(s30.u, 0) as vta30
    from stock_current sc
    left join sw  on sw.sku  = sc.sku
    left join s30 on s30.sku = sc.sku
    where sc.store_id = p_store_id
      and sc.generic_code is not distinct from v_generic
  ),
  by_color as (
    select color,
           sum(stock) as stock_total,
           json_agg(json_build_object(
             'talla', talla, 'sku', sku, 'stock', stock,
             'almacen', almacen, 'piso', piso, 'vta30', vta30,
             'hit', (sku = v_sku)
           ) order by talla) as tallas
    from gen
    group by color
  )
  select json_build_object(
    'sku', v_sku,
    'found', (select count(*) > 0 from vdim),
    'variante', (
      select json_build_object(
        'sku', v_sku,
        'generic_code', coalesce((select generic_code from vdim), v_generic),
        'article_code', (select article_code from vdim),
        'description',  (select description  from vdim),
        'gender',       (select gender       from vdim),
        'mundo',        (select mundo from stock_snapshots where sku = v_sku and snapshot_date = v_snap limit 1),
        'color',        (select color from vdim),
        'talla',        (select talla from vdim),
        'brand',        (select brand from vdim),
        'grupo',        (select group_name from vdim)
      )
    ),
    'precio',        generic_price_info_empresa(v_generic, v_empresa),
    'sales_org',     v_org,
    'empresa_id',    v_empresa,
    'empresa_nombre', v_emp_name,
    'stock_variante', coalesce((select stock from vdim), 0),
    'piso',           coalesce((select floor_units     from sw where sku = v_sku), 0),
    'almacen',        coalesce((select warehouse_units from sw where sku = v_sku),
                               greatest(coalesce((select stock from vdim),0) - coalesce((select floor_units from sw where sku = v_sku),0), 0)),
    'vendido_dias',   p_days,
    'vendido',        coalesce((select u from s30 where sku = v_sku), 0),
    'por_color', coalesce((
      select json_agg(json_build_object('color', coalesce(color,'(s/color)'),
                                         'stock', stock_total, 'tallas', tallas)
                      order by color)
      from by_color
    ), '[]'::json)
  ) into v_result;

  return v_result;
end $$;
