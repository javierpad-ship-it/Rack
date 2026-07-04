-- ============================================================================
-- 0029 — Mapa de precio incluye TODO el stock (no solo lo vendido)
--
-- El heatmap por precio asignaba banda solo a SKUs con ventas (precio =
-- venta/cantidad); el stock sin ventas quedaba fuera y el IRP por banda salía
-- inflado (no cuadraba con la tabla por responsable). Ahora los SKUs sin venta
-- entran con banda por su valor unitario de stock (stk_val/stk), y el mapa
-- cuadra con el IRP global. También se expone el stock por celda (stk).
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
    select sku, sum(units)::numeric as cant, sum(amount)::numeric as val
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
      coalesce(d.stk, 0)  as stk,
      coalesce(d.stk_val, 0) as stk_val,
      -- Precio para la banda: precio de venta si vendió; si no, valor
      -- unitario de stock (así el stock sin ventas también entra al mapa).
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
           sum(cant) cant, sum(val) val, sum(stk) stk, sum(stk_val) stk_val,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end as irp,
           case when (sum(cant)*v_factor+sum(stk))>0
                then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end as irp_proy
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
        'stk',  coalesce(sum(stk),0),
        'stk_val', coalesce(sum(stk_val),0),
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'proy_cant', round(coalesce(sum(cant),0) * v_factor),
        'irp_proy', case when (sum(cant)*v_factor+sum(stk))>0
                         then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end
      ) from banded
    ),
    'rows', (
      select coalesce(json_agg(json_build_object(
        'grp', grp, 'cant', cant, 'val', val, 'stk', stk, 'stk_val', stk_val,
        'irp', irp, 'irp_proy', irp_proy) order by val desc), '[]')
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
