-- ============================================================================
-- 0024 — Reporte de rotación (IRP) con filtros, proyección y mapas de calor
--
-- IRP = ventas(und) / (ventas(und) + stock final(und)) * 100.
-- Stock final = la foto de stock más reciente con fecha <= p_to (el cierre del
-- período; para un mes es el cierre de mes). Atributos por variante (género,
-- mundo, embarque, marca, línea, talla) salen de esa misma foto.
-- Período incompleto: proyección por regla de 3 (unidades a fin de período).
-- Bandas de precio sobre el precio unitario de venta (Venta Act / Cant Act).
-- ============================================================================

-- Valores distintos para poblar los filtros del reporte (de la última foto).
create or replace function rotation_filters()
returns json language sql stable security definer as $$
  with snap as (select max(snapshot_date) d from stock_snapshots)
  select json_build_object(
    'gender',   (select coalesce(json_agg(distinct gender   order by gender),   '[]') from stock_snapshots, snap where snapshot_date = snap.d and gender   is not null and gender   <> ''),
    'mundo',    (select coalesce(json_agg(distinct mundo    order by mundo),    '[]') from stock_snapshots, snap where snapshot_date = snap.d and mundo    is not null and mundo    <> ''),
    'embarque', (select coalesce(json_agg(distinct embarque order by embarque), '[]') from stock_snapshots, snap where snapshot_date = snap.d and embarque is not null and embarque <> ''),
    'brand',    (select coalesce(json_agg(distinct brand    order by brand),    '[]') from stock_snapshots, snap where snapshot_date = snap.d and brand    is not null and brand    <> ''),
    'linea',    (select coalesce(json_agg(distinct sap_line order by sap_line), '[]') from stock_snapshots, snap where snapshot_date = snap.d and sap_line is not null and sap_line <> '')
  );
$$;

-- Reporte principal. Todos los filtros de atributo son opcionales (null = todos).
create or replace function rotation_report(
  p_from     date,
  p_to       date,
  p_store    uuid default null,
  p_gender   text default null,
  p_mundo    text default null,
  p_embarque text default null,
  p_brand    text default null,
  p_linea    text default null
)
returns json language plpgsql stable security definer as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_complete boolean;
  v_factor  numeric;
  v_result  json;
begin
  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;

  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_complete := p_to <= v_today;
  v_factor  := case when v_complete or v_elapsed <= 0 then 1
                    else v_total::numeric / v_elapsed end;

  with dims as (
    select sku,
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
      coalesce(d.linea, '(sin línea)') as linea,
      d.talla,
      coalesce(s.cant, 0) as cant,
      coalesce(s.val, 0)  as val,
      coalesce(d.stk, 0)  as stk,
      coalesce(d.stk_val, 0) as stk_val,
      case when coalesce(s.cant,0) > 0 then s.val / s.cant end as pvp
    from dims d
    full outer join sal s on s.sku = d.sku
    where (p_gender   is null or d.gender   = p_gender)
      and (p_mundo    is null or d.mundo    = p_mundo)
      and (p_embarque is null or d.embarque = p_embarque)
      and (p_brand    is null or d.brand    = p_brand)
      and (p_linea    is null or d.linea    = p_linea)
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
  irp as (
    select case when (sum(cant)+sum(stk)) > 0
                then round(sum(cant) / (sum(cant)+sum(stk)) * 100, 1) else 0 end as v
    from banded
  )
  select json_build_object(
    'snap', v_snap,
    'complete', v_complete,
    'days_total', v_total,
    'days_elapsed', v_elapsed,
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
    'by_linea', (
      select coalesce(json_agg(r order by (r->>'val')::numeric desc), '[]') from (
        select json_build_object(
          'linea', linea,
          'cant', sum(cant), 'val', sum(val), 'stk', sum(stk), 'stk_val', sum(stk_val),
          'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
          'irp_proy', case when (sum(cant)*v_factor+sum(stk))>0
                           then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end
        ) as r
        from banded group by linea
      ) t
    ),
    'price_hm', (
      select coalesce(json_agg(json_build_object(
        'linea', linea, 'band', band,
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'cant', sum(cant)
      )), '[]')
      from banded where band is not null group by linea, band
    ),
    'talla_hm', (
      select coalesce(json_agg(json_build_object(
        'linea', linea, 'talla', coalesce(talla,'(s/t)'),
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'cant', sum(cant)
      )), '[]')
      from banded group by linea, coalesce(talla,'(s/t)')
    )
  ) into v_result;

  return v_result;
end $$;
