-- ============================================================================
-- 0063 — Bandeja de propuestas: exponer la Org. de Ventas (R050/R040)
--
-- price_proposals.sales_org ya se guarda al crear la propuesta (snapshot de la
-- tienda de origen, 0048); solo faltaba devolverlo en price_proposals_review()
-- para mostrar/filtrar por R050/R040 en la web.
-- ============================================================================

create or replace function price_proposals_review(
  p_status      price_proposal_status default 'pendiente',
  p_window_days int default 30
) returns json
language plpgsql stable security definer as $$
declare
  v_admin boolean := current_role_name() in ('admin','analista');
  v_result json;
begin
  with visible as (
    select pp.*
    from price_proposals pp
    where pp.status = p_status
      and (v_admin
           or exists (select 1 from user_lines ul where ul.user_id = auth.uid() and ul.resp = pp.resp))
  ),
  metrics as (
    select
      v.id,
      v.generic_code, v.sku, v.resp, v.status, v.sales_org,
      v.current_pvp, v.proposed_pvp, v.store_id,
      pr.full_name as solicitante,
      st.name      as tienda,
      (select sc.description from stock_current sc
         where pv_generic(sc.sku) = v.generic_code and sc.description is not null limit 1) as descripcion,
      (select sc.gender from stock_current sc
         where pv_generic(sc.sku) = v.generic_code and sc.gender is not null limit 1) as genero,
      (select sc.brand from stock_current sc
         where pv_generic(sc.sku) = v.generic_code and sc.brand is not null limit 1) as marca,
      (select ss.mundo from stock_snapshots ss
         where pv_generic(ss.sku) = v.generic_code and ss.mundo is not null
         order by ss.snapshot_date desc limit 1) as mundo,
      (select round(sum(sc.cost * sc.units) / nullif(sum(sc.units),0), 2)
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
    left join stores   st on st.id = v.store_id
  )
  select coalesce(json_agg(json_build_object(
    'id', id,
    'generic_code', generic_code, 'sku', sku, 'resp', resp,
    'solicitante', solicitante, 'tienda', tienda, 'sales_org', sales_org,
    'descripcion', descripcion, 'genero', genero, 'marca', marca, 'mundo', mundo,
    'current_pvp', current_pvp, 'proposed_pvp', proposed_pvp,
    'costo_prom', costo_prom,
    'stock_tienda', stock_tienda,
    'rot_tienda',  case when (venta_tienda + stock_tienda) > 0
                        then round(venta_tienda::numeric / (venta_tienda + stock_tienda) * 100, 1) else 0 end,
    'stock_cadena', stock_cadena,
    'rot_cadena',  case when (venta_cadena + stock_cadena) > 0
                        then round(venta_cadena::numeric / (venta_cadena + stock_cadena) * 100, 1) else 0 end
  ) order by generic_code), '[]'::json)
  into v_result
  from metrics;

  return v_result;
end $$;
