-- ============================================================================
-- 0069 — Rotación (tienda + cadena) reutilizable + bloqueo de propuestas
--
-- Piden dos cosas sobre el flujo de propuestas de precio de Prisma:
-- 1. Mostrar en la ficha/proponer tanto el IRP en la TIENDA actual como el IRP
--    en la CADENA (antes solo se veía cadena, con el nombre genérico
--    'rotacion' en prisma_variant_lookup).
-- 2. Si el IRP en cadena es > 20% (rotación correcta), NO dejar proponer un
--    cambio de precio — no hace falta tocar el precio de algo que ya rota bien.
--
-- `generic_rotation()` centraliza el cálculo (mismo criterio que
-- prisma_variant_lookup / rotation_report: ventas 30d / (ventas + stock) × 100)
-- para no repetirlo en cada lugar que lo necesita.
-- ============================================================================

create or replace function generic_rotation(
  p_generic  text,
  p_store_id uuid,
  p_days     int default 30
) returns json
language plpgsql stable security definer as $$
declare
  v_stk_cad   numeric;
  v_vta_cad   numeric;
  v_stk_tda   numeric;
  v_vta_tda   numeric;
  v_irp_cad   numeric;
  v_irp_tda   numeric;
begin
  select coalesce(sum(sc.units), 0) into v_stk_cad
  from stock_current sc where pv_generic(sc.sku) = p_generic;
  select coalesce(sum(sd.units), 0) into v_vta_cad
  from sales_daily sd
  where pv_generic(sd.sku) = p_generic and sd.sale_date > current_date - p_days;
  v_irp_cad := case when (v_vta_cad + v_stk_cad) > 0
                     then round(v_vta_cad / (v_vta_cad + v_stk_cad) * 100, 1) else 0 end;

  select coalesce(sum(sc.units), 0) into v_stk_tda
  from stock_current sc where sc.store_id = p_store_id and pv_generic(sc.sku) = p_generic;
  select coalesce(sum(sd.units), 0) into v_vta_tda
  from sales_daily sd
  where sd.store_id = p_store_id and pv_generic(sd.sku) = p_generic
    and sd.sale_date > current_date - p_days;
  v_irp_tda := case when (v_vta_tda + v_stk_tda) > 0
                     then round(v_vta_tda / (v_vta_tda + v_stk_tda) * 100, 1) else 0 end;

  return json_build_object('cadena', v_irp_cad, 'tienda', v_irp_tda);
end $$;

-- prisma_variant_lookup: agrega 'rotacion_tienda' (además de 'rotacion', que
-- ya existía y sigue siendo el IRP de cadena — no se renombra para no romper
-- al cliente actual que ya lo consume).
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
  v_rot      json;
  v_result   json;
begin
  select sales_org, empresa_id into v_org, v_empresa from stores where id = p_store_id;
  select coalesce(nombre_reporte, nombre) into v_emp_name from empresas where id = v_empresa;
  v_generic := generic_of_sku(v_sku);
  select max(snapshot_date) into v_snap from stock_snapshots where sku = v_sku;
  v_rot := generic_rotation(v_generic, p_store_id, p_days);

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
  vdim as (
    select sc.sku, sc.article_code, sc.generic_code, sc.description, sc.group_name,
           sc.gender, sc.color, sc.talla, sc.brand, sc.units as stock
    from stock_current sc
    where sc.store_id = p_store_id and sc.sku = v_sku
    limit 1
  ),
  gen as (
    select sc.color, sc.talla, sc.sku, sc.units as stock,
           coalesce(sw.floor_units, 0) as piso,
           coalesce(sw.warehouse_units, greatest(sc.units - coalesce(sw.floor_units,0), 0)) as almacen,
           coalesce(s30.u, 0) as vta30
    from stock_current sc
    left join sw  on sw.sku  = sc.sku
    left join s30 on s30.sku = sc.sku
    where sc.store_id = p_store_id
      and pv_generic(sc.sku) is not distinct from v_generic
  ),
  by_color as (
    select color,
           sum(stock) as stock_total,
           json_agg(json_build_object(
             'talla', talla, 'sku', sku, 'stock', stock,
             'almacen', almacen, 'piso', piso, 'vta30', vta30,
             'hit', (sku = v_sku)
           ) order by
             case when talla_sort_key(talla) is not null then 0
                  when talla ~ '^\d+$' then 1
                  else 2 end,
             talla_sort_key(talla),
             case when talla ~ '^\d+$' then talla::int end,
             talla
           ) as tallas
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
    'rotacion',        (v_rot->>'cadena')::numeric,
    'rotacion_tienda', (v_rot->>'tienda')::numeric,
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
    ), '[]'::json),
    'propuesta_pendiente', coalesce((
      select json_agg(json_build_object(
               'id', pp.id,
               'proposed_pvp', pp.proposed_pvp,
               'current_pvp', pp.current_pvp,
               'created_at', pp.created_at,
               'tienda', st2.name,
               'solicitante', pr2.full_name
             ) order by pp.created_at desc)
      from price_proposals pp
      left join stores   st2 on st2.id = pp.store_id
      left join profiles pr2 on pr2.id = pp.requested_by
      where pp.generic_code = v_generic and pp.status = 'pendiente'
    ), '[]'::json)
  ) into v_result;

  return v_result;
end $$;
