-- ============================================================================
-- 0026 — Rendimiento del reporte de rotación + desglose por tienda
--
-- * Índices para que rotation_report no haga seq scans (evita statement timeout).
-- * Sube el statement_timeout del rol de la API (consultas analíticas pesadas).
-- * rotation_stores: IRP/ventas/stock por TIENDA (para la pestaña "Por tienda").
-- ============================================================================

create index if not exists sales_daily_date_idx      on sales_daily (sale_date);
create index if not exists stock_snapshots_date_idx  on stock_snapshots (snapshot_date);
create index if not exists stock_snapshots_date_sku_idx on stock_snapshots (snapshot_date, sku);

-- Más margen para los reportes analíticos (por defecto suele ser 8s).
do $$ begin
  execute 'alter role authenticated set statement_timeout = ''30s''';
exception when others then null; end $$;
do $$ begin
  execute 'alter role anon set statement_timeout = ''30s''';
exception when others then null; end $$;

-- Desglose de rotación por tienda (respeta los mismos filtros de atributo).
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
returns json language plpgsql stable security definer as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_factor  numeric;
  v_result  json;
begin
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
    select store_id, sum(units)::numeric cant, sum(amount)::numeric val
    from sales_daily
    where sale_date between p_from and p_to
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  stk as (
    select store_id, sum(units)::numeric stk, sum(value)::numeric stk_val
    from stock_snapshots
    where snapshot_date = v_snap
      and (p_gender is null and p_mundo is null and p_embarque is null and p_brand is null and p_linea is null and p_resp is null
           or sku in (select sku from ok_sku))
    group by store_id
  ),
  base as (
    select st.id as store_id, st.name,
           coalesce(sal.cant,0) cant, coalesce(sal.val,0) val,
           coalesce(stk.stk,0) stk, coalesce(stk.stk_val,0) stk_val
    from stores st
    left join sal on sal.store_id = st.id
    left join stk on stk.store_id = st.id
  )
  select coalesce(json_agg(json_build_object(
    'store', name, 'cant', cant, 'val', val, 'stk', stk, 'stk_val', stk_val,
    'irp', case when (cant+stk)>0 then round(cant/(cant+stk)*100,1) else 0 end,
    'irp_proy', case when (cant*v_factor+stk)>0 then round(cant*v_factor/(cant*v_factor+stk)*100,1) else 0 end
  ) order by val desc), '[]')
  into v_result
  from base where cant > 0 or stk > 0;

  return v_result;
end $$;
