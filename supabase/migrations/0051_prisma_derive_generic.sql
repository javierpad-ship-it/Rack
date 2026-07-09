-- ============================================================================
-- 0051 — Prisma: derivar el genérico desde el SKU
--
-- Verificado sobre el catálogo real (55.391 variantes): la variante SIEMPRE es
-- `genérico + 3 dígitos` (ej. genérico 1000031853 → variante 1000031853001).
-- Por eso el genérico se deriva del SKU en SQL y no hace falta backfill de
-- `generic_code` en las tablas de hechos ni una tabla de mapeo variante→genérico.
-- Se reescriben los dos RPCs para agrupar por pv_generic(sku).
-- ============================================================================

create or replace function pv_generic(p_sku text)
returns text language sql immutable as $$
  select case when p_sku ~ '^\d+$' and length(p_sku) > 3
              then left(p_sku, length(p_sku) - 3) else null end;
$$;

create or replace function generic_of_sku(p_sku text)
returns text language sql stable as $$
  select coalesce(
    (select generic_code from stock_current where sku = p_sku and generic_code is not null limit 1),
    (select generic_code from sales_daily  where sku = p_sku and generic_code is not null limit 1),
    pv_generic(p_sku)
  );
$$;

create or replace function prisma_variant_lookup(
  p_store_id uuid, p_sku text, p_days int default 30
) returns json language plpgsql stable security definer as $$
declare
  v_sku text := norm_sku(p_sku);
  v_week text := comm_week(now());
  v_org text; v_generic text; v_snap date; v_result json;
begin
  select sales_org into v_org from stores where id = p_store_id;
  v_generic := generic_of_sku(v_sku);
  select max(snapshot_date) into v_snap from stock_snapshots where sku = v_sku;

  with sw as (
    select sku, total_units, floor_units, warehouse_units from store_warehouse(p_store_id, v_week)
  ),
  s30 as (
    select sku, sum(units)::int as u from sales_daily
    where store_id = p_store_id and sale_date > current_date - p_days group by sku
  ),
  vdim as (
    select sc.sku, sc.article_code, sc.generic_code, sc.description, sc.group_name,
           sc.gender, sc.color, sc.talla, sc.brand, sc.units as stock
    from stock_current sc where sc.store_id = p_store_id and sc.sku = v_sku limit 1
  ),
  gen as (
    select sc.color, sc.talla, sc.sku, sc.units as stock,
           coalesce(sw.floor_units, 0) as piso,
           coalesce(sw.warehouse_units, greatest(sc.units - coalesce(sw.floor_units,0), 0)) as almacen,
           coalesce(s30.u, 0) as vta30
    from stock_current sc
    left join sw on sw.sku = sc.sku
    left join s30 on s30.sku = sc.sku
    where sc.store_id = p_store_id and pv_generic(sc.sku) is not distinct from v_generic
  ),
  by_color as (
    select color, sum(stock) as stock_total,
           json_agg(json_build_object('talla',talla,'sku',sku,'stock',stock,'almacen',almacen,
                                       'piso',piso,'vta30',vta30,'hit',(sku=v_sku)) order by talla) as tallas
    from gen group by color
  )
  select json_build_object(
    'sku', v_sku,
    'found', (select count(*) > 0 from vdim),
    'variante', (select json_build_object(
        'sku', v_sku,
        'generic_code', coalesce((select generic_code from vdim), v_generic),
        'article_code', (select article_code from vdim),
        'description', (select description from vdim),
        'gender', (select gender from vdim),
        'mundo', (select mundo from stock_snapshots where sku=v_sku and snapshot_date=v_snap limit 1),
        'color', (select color from vdim), 'talla', (select talla from vdim),
        'brand', (select brand from vdim), 'grupo', (select group_name from vdim))),
    'precio', generic_price_info(v_generic, v_org),
    'sales_org', v_org,
    'stock_variante', coalesce((select stock from vdim), 0),
    'piso', coalesce((select floor_units from sw where sku=v_sku), 0),
    'almacen', coalesce((select warehouse_units from sw where sku=v_sku),
                        greatest(coalesce((select stock from vdim),0) - coalesce((select floor_units from sw where sku=v_sku),0), 0)),
    'vendido_dias', p_days,
    'vendido', coalesce((select u from s30 where sku=v_sku), 0),
    'por_color', coalesce((select json_agg(json_build_object('color',coalesce(color,'(s/color)'),
                             'stock',stock_total,'tallas',tallas) order by color) from by_color), '[]'::json)
  ) into v_result;
  return v_result;
end $$;

create or replace function price_proposals_review(
  p_status price_proposal_status default 'pendiente', p_window_days int default 30
) returns json language plpgsql stable security definer as $$
declare v_admin boolean := current_role_name() in ('admin','analista'); v_result json;
begin
  with visible as (
    select pp.* from price_proposals pp
    where pp.status = p_status
      and (v_admin or exists (select 1 from user_lines ul where ul.user_id = auth.uid() and ul.resp = pp.resp))
  ),
  metrics as (
    select v.id, v.generic_code, v.sku, v.resp, v.status, v.current_pvp, v.proposed_pvp, v.store_id,
      pr.full_name as solicitante, st.name as tienda,
      (select round(sum(sc.cost*sc.units)/nullif(sum(sc.units),0),2)
         from stock_current sc where pv_generic(sc.sku) = v.generic_code) as costo_prom,
      coalesce((select sum(units) from stock_current sc
                 where pv_generic(sc.sku)=v.generic_code and sc.store_id=v.store_id),0) as stock_tienda,
      coalesce((select sum(units) from stock_current sc
                 where pv_generic(sc.sku)=v.generic_code),0) as stock_cadena,
      coalesce((select sum(units) from sales_daily sd
                 where pv_generic(sd.sku)=v.generic_code and sd.store_id=v.store_id
                   and sd.sale_date > current_date - p_window_days),0) as venta_tienda,
      coalesce((select sum(units) from sales_daily sd
                 where pv_generic(sd.sku)=v.generic_code
                   and sd.sale_date > current_date - p_window_days),0) as venta_cadena
    from visible v
    left join profiles pr on pr.id = v.requested_by
    left join stores st on st.id = v.store_id
  )
  select coalesce(json_agg(json_build_object(
    'id',id,'generic_code',generic_code,'sku',sku,'resp',resp,'solicitante',solicitante,'tienda',tienda,
    'current_pvp',current_pvp,'proposed_pvp',proposed_pvp,'costo_prom',costo_prom,
    'stock_tienda',stock_tienda,
    'rot_tienda', case when (venta_tienda+stock_tienda)>0 then round(venta_tienda::numeric/(venta_tienda+stock_tienda)*100,1) else 0 end,
    'stock_cadena',stock_cadena,
    'rot_cadena', case when (venta_cadena+stock_cadena)>0 then round(venta_cadena::numeric/(venta_cadena+stock_cadena)*100,1) else 0 end
  ) order by generic_code), '[]'::json) into v_result from metrics;
  return v_result;
end $$;