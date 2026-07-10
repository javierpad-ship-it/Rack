-- ============================================================================
-- 0061 — Orden de tallas: XS, S, M, L, XL, XXL, XXXL antes que alfabético
--
-- El detalle del genérico por color (prisma_variant_lookup) ordenaba las
-- tallas con `order by talla` (alfabético), lo que deja L antes que M antes
-- que S. Se agrega talla_sort_key() para las tallas de letra conocidas y se
-- usa como criterio principal; tallas numéricas ordenan numéricamente; el
-- resto cae a alfabético al final.
-- ============================================================================

create or replace function talla_sort_key(p_talla text)
returns int language sql immutable as $$
  select case upper(trim(coalesce(p_talla, '')))
    when 'XS'   then 1
    when 'S'    then 2
    when 'M'    then 3
    when 'L'    then 4
    when 'XL'   then 5
    when 'XXL'  then 6
    when '2XL'  then 6
    when 'XXXL' then 7
    when '3XL'  then 7
    else null
  end;
$$;

create or replace function prisma_variant_lookup(
  p_store_id uuid, p_sku text, p_days int default 30
) returns json language plpgsql stable security definer as $$
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
