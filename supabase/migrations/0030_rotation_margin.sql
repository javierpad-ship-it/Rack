-- ============================================================================
-- 0030 — Margen % en los dashboards de rotación
--
-- Margen % = suma(MG Act) / suma(Venta Act) * 100 (por grupo / tienda / global).
-- MG Act ya se carga en sales_daily.margin. Se agrega a rotation_report (kpis
-- y filas por grupo) y a rotation_stores (por tienda). El mapa de precio ahora
-- incluye todo el stock (viene de 0029).
-- ============================================================================

create or replace function rotation_report(
  p_from     date,
  p_to       date,
  p_group_by text default 'resp',
  p_store    uuid default null,
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
  v_complete boolean;
  v_factor  numeric;
  v_result  json;
begin
  if current_role_name() not in ('admin', 'analista') then
    p_store := current_store_id();
    if p_store is null then
      raise exception 'Sin tienda asignada';
    end if;
  end if;

  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;

  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_complete := p_to <= v_today;
  v_factor  := case when v_complete or v_elapsed <= 0 then 1
                    else v_total::numeric / v_elapsed end;

  with dims as (
    select sku,
           max(resp)     as resp,
           max(gender)   as gender,
           max(mundo)    as mundo,
           max(embarque) as embarque,
           max(brand)    as brand,
           max(sap_line) as linea,
           max(talla)    as talla,
           sum(units)::numeric  as stk,
           sum(value)::numeric  as stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (p_store is null or store_id = p_store)
    group by sku
  ),
  sal as (
    select sku, sum(units)::numeric as cant, sum(amount)::numeric as val, sum(margin)::numeric as mg
    from sales_daily
    where sale_date between p_from and p_to
      and (p_store is null or store_id = p_store)
    group by sku
  ),
  base as (
    select
      case p_group_by
        when 'linea'  then coalesce(d.linea,  '(sin línea)')
        when 'brand'  then coalesce(d.brand,  '(sin marca)')
        when 'mundo'  then coalesce(d.mundo,  '(sin mundo)')
        when 'gender' then coalesce(d.gender, '(sin género)')
        else coalesce(d.resp, '(sin responsable)')
      end as grp,
      d.talla,
      coalesce(s.cant, 0) as cant,
      coalesce(s.val, 0)  as val,
      coalesce(s.mg, 0)   as mg,
      coalesce(d.stk, 0)  as stk,
      coalesce(d.stk_val, 0) as stk_val,
      case
        when coalesce(s.cant, 0) > 0 then s.val / s.cant
        when coalesce(d.stk, 0)  > 0 then coalesce(d.stk_val, 0) / d.stk
      end as pvp
    from dims d
    full outer join sal s on s.sku = d.sku
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
    from base
  ),
  g_rows as (
    select grp,
           sum(cant) cant, sum(val) val, sum(mg) mg, sum(stk) stk, sum(stk_val) stk_val,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp,
           case when (sum(cant)*v_factor+sum(stk))>0
                then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end as irp_proy,
           case when sum(val)>0 then round(sum(mg)/sum(val)*100,1) else 0 end as mgn
    from banded group by grp
  ),
  g_price as (
    select grp, band, sum(cant) cant, sum(stk) stk,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded where band is not null group by grp, band
  ),
  g_talla as (
    select grp, coalesce(talla,'(s/t)') as talla, sum(cant) cant, sum(stk) stk,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp
    from banded group by grp, coalesce(talla,'(s/t)')
  )
  select json_build_object(
    'snap', v_snap,
    'complete', v_complete,
    'days_total', v_total,
    'days_elapsed', v_elapsed,
    'group_by', p_group_by,
    'kpis', (
      select json_build_object(
        'cant', coalesce(sum(cant),0),
        'val',  coalesce(sum(val),0),
        'mg',   coalesce(sum(mg),0),
        'stk',  coalesce(sum(stk),0),
        'stk_val', coalesce(sum(stk_val),0),
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'mgn', case when sum(val)>0 then round(sum(mg)/sum(val)*100,1) else 0 end,
        'proy_cant', round(coalesce(sum(cant),0) * v_factor),
        'irp_proy', case when (sum(cant)*v_factor+sum(stk))>0
                         then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end
      ) from banded
    ),
    'rows', (
      select coalesce(json_agg(json_build_object(
        'grp', grp, 'cant', cant, 'val', val, 'mg', mg, 'stk', stk, 'stk_val', stk_val,
        'irp', irp, 'irp_proy', irp_proy, 'mgn', mgn) order by val desc), '[]')
      from g_rows
    ),
    'price_hm', (
      select coalesce(json_agg(json_build_object('grp', grp, 'band', band, 'irp', irp, 'cant', cant, 'stk', stk)), '[]')
      from g_price
    ),
    'talla_hm', (
      select coalesce(json_agg(json_build_object('grp', grp, 'talla', talla, 'irp', irp, 'cant', cant, 'stk', stk)), '[]')
      from g_talla
    )
  ) into v_result;

  return v_result;
end $$;

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
           max(brand) brand, max(sap_line) linea, max(resp) resp
    from stock_snapshots where snapshot_date = v_snap group by sku
  ),
  ok_sku as (
    select sku from dims
    where (p_gender   is null or gender   = p_gender)
      and (p_mundo    is null or mundo    = p_mundo)
      and (p_embarque is null or embarque = p_embarque)
      and (p_brand    is null or brand    = p_brand)
      and (p_linea    is null or linea    = p_linea)
      and (p_resp     is null or resp     = p_resp)
  ),
  sal as (
    select store_id, sum(units)::numeric cant, sum(amount)::numeric val, sum(margin)::numeric mg
    from sales_daily
    where sale_date between p_from and p_to
      and (v_store is null or store_id = v_store)
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  stk as (
    select store_id, sum(units)::numeric stk, sum(value)::numeric stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (v_store is null or store_id = v_store)
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  base as (
    select st.id as store_id, st.name,
           coalesce(sal.cant,0) cant, coalesce(sal.val,0) val, coalesce(sal.mg,0) mg,
           coalesce(stk.stk,0) stk, coalesce(stk.stk_val,0) stk_val
    from stores st
    left join sal on sal.store_id = st.id
    left join stk on stk.store_id = st.id
    where (v_store is null or st.id = v_store)
  )
  select coalesce(json_agg(json_build_object(
    'store', name, 'cant', cant, 'val', val, 'mg', mg, 'stk', stk, 'stk_val', stk_val,
    'irp', case when (cant+stk)>0 then round(cant/(cant+stk)*100,1) else 0 end,
    'irp_proy', case when (cant*v_factor+stk)>0 then round(cant*v_factor/(cant*v_factor+stk)*100,1) else 0 end,
    'mgn', case when val>0 then round(mg/val*100,1) else 0 end
  ) order by val desc), '[]')
  into v_result
  from base where cant > 0 or stk > 0;

  return v_result;
end $$;
