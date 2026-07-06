-- ============================================================================
-- 0035 — Drill-down jerárquico para Alertas
--
-- Explora la rotación bajando por niveles: Responsable → Mueble (piso de venta)
-- → Género → Mundo → Línea → Código genérico (artículo) → Talla → SKU.
-- Cada nivel devuelve ventas/monto/stock/IRP/IRP proy./margen % + un total.
-- El cliente pasa el filtro del camino ya elegido y pide agrupar por p_next.
--
-- Mueble = última ubicación escaneada del SKU en la tienda (scan_sessions más
-- reciente hasta p_to). Sin escaneo → '(sin ubicación)'.
-- ============================================================================

create or replace function alert_drill(
  p_from     date,
  p_to       date,
  p_store    uuid default null,
  p_next     text default 'resp',
  p_resp     text default null,
  p_mueble   text default null,
  p_gender   text default null,
  p_mundo    text default null,
  p_linea    text default null,
  p_articulo text default null,
  p_talla    text default null,
  p_sku      text default null
)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_snap    date;
  v_today   date := current_date;
  v_total   int;
  v_elapsed int;
  v_factor  numeric;
  v_result  json;
begin
  if current_role_name() not in ('admin', 'analista') then
    p_store := current_store_id();
    if p_store is null then raise exception 'Sin tienda asignada'; end if;
  end if;

  select max(snapshot_date) into v_snap from stock_snapshots where snapshot_date <= p_to;
  v_total   := (p_to - p_from) + 1;
  v_elapsed := (least(p_to, v_today) - p_from) + 1;
  v_factor  := case when p_to <= v_today or v_elapsed <= 0 then 1 else v_total::numeric / v_elapsed end;

  with stk as (
    select store_id, sku, sum(units)::numeric stk, sum(value)::numeric stk_val,
           max(resp) resp, max(gender) gender, max(mundo) mundo, max(sap_line) linea,
           max(article_code) articulo, max(talla) talla
    from stock_snapshots
    where snapshot_date = v_snap and (p_store is null or store_id = p_store)
    group by store_id, sku
  ),
  sal as (
    select store_id, sku, sum(units)::numeric cant, sum(amount)::numeric val, sum(margin)::numeric mg
    from sales_daily
    where sale_date between p_from and p_to and (p_store is null or store_id = p_store)
    group by store_id, sku
  ),
  mue as (
    select distinct on (ss.store_id, sl.sku) ss.store_id, sl.sku, f.name as fixture
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    join fixtures f on f.id = ss.fixture_id
    where ss.scanned_at::date <= p_to and (p_store is null or ss.store_id = p_store)
    order by ss.store_id, sl.sku, ss.scanned_at desc
  ),
  base as (
    select coalesce(st.store_id, sa.store_id) store_id, coalesce(st.sku, sa.sku) sku,
           coalesce(sa.cant, 0) cant, coalesce(sa.val, 0) val, coalesce(sa.mg, 0) mg,
           coalesce(st.stk, 0) stk, coalesce(st.stk_val, 0) stk_val,
           st.resp, st.gender, st.mundo, st.linea, st.articulo, st.talla,
           coalesce(m.fixture, '(sin ubicación)') mueble
    from stk st
    full outer join sal sa on sa.store_id = st.store_id and sa.sku = st.sku
    left join mue m on m.store_id = coalesce(st.store_id, sa.store_id)
                   and m.sku = coalesce(st.sku, sa.sku)
  ),
  filt as (
    select
      case p_next
        when 'resp'     then coalesce(resp,    '(sin responsable)')
        when 'mueble'   then mueble
        when 'gender'   then coalesce(gender,  '(sin género)')
        when 'mundo'    then coalesce(mundo,   '(sin mundo)')
        when 'linea'    then coalesce(linea,   '(sin línea)')
        when 'articulo' then coalesce(articulo,'(sin artículo)')
        when 'talla'    then coalesce(talla,   '(s/t)')
        else sku
      end as key,
      cant, val, mg, stk, stk_val
    from base
    where (p_resp     is null or coalesce(resp,    '(sin responsable)') = p_resp)
      and (p_mueble   is null or mueble = p_mueble)
      and (p_gender   is null or coalesce(gender,  '(sin género)')  = p_gender)
      and (p_mundo    is null or coalesce(mundo,   '(sin mundo)')   = p_mundo)
      and (p_linea    is null or coalesce(linea,   '(sin línea)')   = p_linea)
      and (p_articulo is null or coalesce(articulo,'(sin artículo)')= p_articulo)
      and (p_talla    is null or coalesce(talla,   '(s/t)')         = p_talla)
      and (p_sku      is null or sku = p_sku)
  ),
  agg as (
    select key, sum(cant) cant, sum(val) val, sum(mg) mg, sum(stk) stk, sum(stk_val) stk_val,
           case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end irp,
           case when (sum(cant)*v_factor+sum(stk))>0
                then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end irp_proy,
           case when sum(val)>0 then round(sum(mg)/sum(val)*100,1) else 0 end mgn
    from filt group by key
  )
  select json_build_object(
    'next', p_next,
    'rows', (
      select coalesce(json_agg(json_build_object(
        'key', key, 'cant', cant, 'val', val, 'mg', mg, 'stk', stk, 'stk_val', stk_val,
        'irp', irp, 'irp_proy', irp_proy, 'mgn', mgn) order by val desc), '[]')
      from agg where cant <> 0 or stk <> 0
    ),
    'tot', (
      select json_build_object(
        'cant', coalesce(sum(cant),0), 'val', coalesce(sum(val),0), 'mg', coalesce(sum(mg),0),
        'stk', coalesce(sum(stk),0), 'stk_val', coalesce(sum(stk_val),0),
        'irp', case when (sum(cant)+sum(stk))>0 then round(sum(cant)/(sum(cant)+sum(stk))*100,1) else 0 end,
        'irp_proy', case when (sum(cant)*v_factor+sum(stk))>0
                         then round(sum(cant)*v_factor/(sum(cant)*v_factor+sum(stk))*100,1) else 0 end,
        'mgn', case when sum(val)>0 then round(sum(mg)/sum(val)*100,1) else 0 end
      ) from filt
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function alert_drill(date,date,uuid,text,text,text,text,text,text,text,text,text) from public;
grant execute on function alert_drill(date,date,uuid,text,text,text,text,text,text,text,text,text) to authenticated;
