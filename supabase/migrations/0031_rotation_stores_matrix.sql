-- ============================================================================
-- 0031 — Matrices tienda×talla y tienda×precio en la pestaña "Por tienda"
--
-- rotation_stores pasa de devolver un array de tiendas a un objeto JSON con:
--   rows      — una fila por tienda (igual que antes: cant/val/mg/stk/irp/mgn…)
--   price_hm  — IRP por (tienda, rango de precio de venta)
--   talla_hm  — IRP por (tienda, talla)
-- La lógica de bandas/pvp/talla replica rotation_report (0030) pero agrupando
-- por tienda, de modo que los totales por tienda cuadran con el resumen.
-- ============================================================================

create or replace function rotation_stores(
  p_from     date,
  p_to       date,
  p_gender   text default null,
  p_mundo    text default null,
  p_embarque text default null,
  p_brand    text default null,
  p_linea    text default null,
  p_resp     text default null
)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_factor  numeric;
  v_store   uuid := null;
  v_result  json;
begin
  if current_role_name() not in ('admin', 'analista') then
    v_store := current_store_id();
    if v_store is null then
      raise exception 'Sin tienda asignada';
    end if;
  end if;

  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;
  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_factor  := case when p_to <= v_today or v_elapsed <= 0 then 1 else v_total::numeric / v_elapsed end;

  with dims as (
    select sku, max(gender) gender, max(mundo) mundo, max(embarque) embarque,
           max(brand) brand, max(sap_line) linea, max(resp) resp, max(talla) talla
    from stock_snapshots where snapshot_date = v_snap group by sku
  ),
  sal as (
    select store_id, sku, sum(units)::numeric cant, sum(amount)::numeric val, sum(margin)::numeric mg
    from sales_daily
    where sale_date between p_from and p_to
      and (v_store is null or store_id = v_store)
    group by store_id, sku
  ),
  stk as (
    select store_id, sku, sum(units)::numeric stk, sum(value)::numeric stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (v_store is null or store_id = v_store)
    group by store_id, sku
  ),
  base as (
    select coalesce(sa.store_id, sk.store_id) as store_id,
           coalesce(sa.sku, sk.sku)           as sku,
           coalesce(sa.cant, 0)   as cant,
           coalesce(sa.val, 0)    as val,
           coalesce(sa.mg, 0)     as mg,
           coalesce(sk.stk, 0)    as stk,
           coalesce(sk.stk_val, 0) as stk_val
    from sal sa
    full outer join stk sk on sk.store_id = sa.store_id and sk.sku = sa.sku
  ),
  enr as (
    select b.store_id, st.name as store, b.cant, b.val, b.mg, b.stk, b.stk_val,
           coalesce(d.talla, '(s/t)') as talla,
           case
             when b.cant > 0 then b.val / b.cant
             when b.stk  > 0 then b.stk_val / b.stk
           end as pvp
    from base b
    join stores st on st.id = b.store_id
    left join dims d on d.sku = b.sku
    where (p_gender   is null or d.gender   = p_gender)
      and (p_mundo    is null or d.mundo    = p_mundo)
      and (p_embarque is null or d.embarque = p_embarque)
      and (p_brand    is null or d.brand    = p_brand)
      and (p_linea    is null or d.linea    = p_linea)
      and (p_resp     is null or d.resp     = p_resp)
  ),
  banded as (
    select *,
      case
        when pvp is null then null
        when pvp < 9  then '<9'
        when pvp < 10 then '9-10'
        when pvp < 20 then '10-20'
        when pvp < 30 then '20-30'
        when pvp < 40 then '30-40'
        when pvp < 50 then '40-50'
        when pvp < 70 then '50-70'
        else '70+'
      end as band
    from enr
  ),
  s_rows as (
    select store,
           sum(cant) cant, sum(val) val, sum(mg) mg, sum(stk) stk, sum(stk_val) stk_val,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp,
           case when (sum(cant)*v_factor+sum(stk))>0
                then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end as irp_proy,
           case when sum(val)>0 then round(sum(mg)/sum(val)*100,1) else 0 end as mgn
    from banded group by store
  ),
  s_price as (
    select store, band, sum(cant) cant, sum(stk) stk,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded where band is not null group by store, band
  ),
  s_talla as (
    select store, talla, sum(cant) cant, sum(stk) stk,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded group by store, talla
  )
  select json_build_object(
    'rows', (
      select coalesce(json_agg(json_build_object(
        'store', store, 'cant', cant, 'val', val, 'mg', mg, 'stk', stk, 'stk_val', stk_val,
        'irp', irp, 'irp_proy', irp_proy, 'mgn', mgn) order by val desc), '[]')
      from s_rows where cant > 0 or stk > 0
    ),
    'price_hm', (
      select coalesce(json_agg(json_build_object('grp', store, 'band', band, 'irp', irp, 'cant', cant, 'stk', stk)), '[]')
      from s_price
    ),
    'talla_hm', (
      select coalesce(json_agg(json_build_object('grp', store, 'talla', talla, 'irp', irp, 'cant', cant, 'stk', stk)), '[]')
      from s_talla
    )
  ) into v_result;

  return v_result;
end $$;
