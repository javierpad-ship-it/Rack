-- ============================================================================
-- 0065 — Piso vigente: el último audit sigue valiendo entre semanas
--
-- Hasta ahora "piso" = lo escaneado EN ESA SEMANA exacta. Si un mueble no se
-- reescaneaba, su piso caía a 0 al cambiar de semana, aunque físicamente la
-- mercadería seguía ahí. Flujo real del negocio: auditoría completa del
-- mueble ~1 vez al mes (kind='audit') y reposiciones sueltas entre medio
-- (kind='restock', Rack One - Repo) que sostienen el dato.
--
-- fixture_floor_vigente(tienda) es la fuente única de piso "ahora":
--   piso(mueble, sku) = último audit (cualquier semana)
--                      + reposiciones desde ese audit en adelante
--                      − ventas atribuidas a ese mueble/sku en semanas
--                        POSTERIORES a la del audit (sales_attribution, que ya
--                        resuelve "primer mueble escaneado" por semana — así
--                        no se descuenta dos veces si el sku vive en 2 muebles).
-- No se resta la venta de la semana del propio audit (evita descontar ventas
-- de ANTES del recuento físico, que ya quedaron reflejadas en el conteo).
--
-- Reemplaza el piso de: store_warehouse, floor_vs_warehouse, floor_breakdown,
-- floor_detail, floor_detail_all. Todo lo demás de esas funciones queda IGUAL
-- (alias de tienda, dims, normalización de SKU, gating por rol) — se preserva
-- tal cual está en producción para no revertir fixes previos (ver gotcha #2).
--
-- NO cambia (a propósito, fuera de este alcance): scan_coverage (sigue
-- midiendo si se auditó ESTA semana — útil como indicador de cuándo toca la
-- próxima auditoría completa) ni recalc_fixture_metrics/weekly_fixture_metrics
-- (comparativa semana a semana de Reportes/Mensual/Tendencias).
-- ============================================================================

create index if not exists scan_sessions_store_kind_scanned_idx
  on scan_sessions (store_id, kind, scanned_at desc);

create or replace function fixture_floor_vigente(p_store_id uuid)
returns table (fixture_id uuid, sku text, units int)
language sql stable security definer set search_path = public, pg_temp as $$
  with last_audit as (
    select distinct on (ss.fixture_id)
      ss.fixture_id, ss.id as session_id, ss.scanned_at, ss.week
    from scan_sessions ss
    where ss.store_id = p_store_id and ss.kind = 'audit'
    order by ss.fixture_id, ss.scanned_at desc
  ),
  audit_qty as (
    select la.fixture_id, la.scanned_at, la.week, norm_sku(sl.sku) as sku,
           sum(sl.quantity)::int as qty
    from last_audit la
    join scan_lines sl on sl.session_id = la.session_id
    group by la.fixture_id, la.scanned_at, la.week, norm_sku(sl.sku)
  ),
  restock_qty as (
    select ss.fixture_id, norm_sku(sl.sku) as sku, sum(sl.quantity)::int as qty
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    join last_audit la on la.fixture_id = ss.fixture_id
    where ss.store_id = p_store_id and ss.kind = 'restock'
      and ss.scanned_at > la.scanned_at
    group by ss.fixture_id, norm_sku(sl.sku)
  ),
  base_skus as (
    select fixture_id, sku from audit_qty
    union
    select fixture_id, sku from restock_qty
  ),
  gross as (
    select b.fixture_id, b.sku,
           coalesce(a.qty, 0) + coalesce(r.qty, 0) as qty,
           la.week as audit_week
    from base_skus b
    join last_audit la on la.fixture_id = b.fixture_id
    left join audit_qty  a on a.fixture_id = b.fixture_id and a.sku = b.sku
    left join restock_qty r on r.fixture_id = b.fixture_id and r.sku = b.sku
  ),
  sold as (
    select g.fixture_id, g.sku, coalesce(sum(sa.units), 0)::int as sold
    from gross g
    left join sales_attribution sa
      on sa.store_id = p_store_id and sa.fixture_id = g.fixture_id
     and sa.sku = g.sku and sa.week > g.audit_week
    group by g.fixture_id, g.sku
  )
  select g.fixture_id, g.sku, greatest(g.qty - coalesce(s.sold, 0), 0)::int as units
  from gross g
  left join sold s on s.fixture_id = g.fixture_id and s.sku = g.sku;
$$;

revoke all on function fixture_floor_vigente(uuid) from public;
grant execute on function fixture_floor_vigente(uuid) to authenticated;

-- ---------------------------------------------------------------------------
-- store_warehouse: piso por SKU (sumado entre muebles) ahora "vigente".
-- ---------------------------------------------------------------------------
create or replace function store_warehouse(p_store_id uuid, p_week text)
returns table (sku text, total_units int, floor_units int, warehouse_units int)
language sql stable security definer set search_path = public, pg_temp as $$
  with floor as (
    select sku, sum(units)::int as floor_units
    from fixture_floor_vigente(p_store_id)
    group by sku
  )
  select
    st.sku, st.total_units,
    coalesce(f.floor_units, 0) as floor_units,
    greatest(st.total_units - coalesce(f.floor_units, 0), 0) as warehouse_units
  from store_stock st
  left join floor f on f.sku = st.sku
  where st.store_id = p_store_id and st.week = p_week;
$$;

-- ---------------------------------------------------------------------------
-- floor_vs_warehouse: piso por tienda ahora "vigente" (todo lo demás igual).
-- ---------------------------------------------------------------------------
create or replace function floor_vs_warehouse(p_week text)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_store  uuid := null;
  v_start  date := comm_week_start(p_week);
  v_end    date := comm_week_start(p_week) + 6;
  v_dim    int  := extract(day from (date_trunc('month', comm_week_start(p_week)) + interval '1 month - 1 day'))::int;
  v_factor numeric := v_dim::numeric / 7;
  v_result json;
begin
  if current_role_name() not in ('admin', 'analista') then
    v_store := current_store_id();
    if v_store is null then raise exception 'Sin tienda asignada'; end if;
  end if;
  with piso as (
    select st.id as store_id, sum(ffn.units)::numeric as u
    from stores st
    cross join lateral fixture_floor_vigente(st.id) ffn
    where (v_store is null or st.id = v_store)
    group by st.id
  ),
  stk_week as (
    select store_id, sum(total_units)::numeric u from store_stock
    where week = p_week and (v_store is null or store_id = v_store) group by store_id
  ),
  stk_cur as (
    select store_id, sum(units)::numeric u from stock_current
    where (v_store is null or store_id = v_store) group by store_id
  ),
  ven as (
    select store_id, sum(units)::numeric u from sales_daily
    where sale_date between v_start and v_end and (v_store is null or store_id = v_store) group by store_id
  ),
  base as (
    select st.id store_id, st.name store, coalesce(p.u,0) piso,
           coalesce(sw.u, sc.u, 0) total, coalesce(v.u,0) ventas
    from stores st
    left join piso p on p.store_id=st.id
    left join stk_week sw on sw.store_id=st.id
    left join stk_cur sc on sc.store_id=st.id
    left join ven v on v.store_id=st.id
    where (v_store is null or st.id = v_store)
  ),
  calc as (
    select store, piso, greatest(total-piso,0) almacen, total, ventas,
      case when total>0 then round(piso/total*100,1) else 0 end pct_piso,
      case when (ventas+piso)>0 then round(ventas/(ventas+piso)*100,1) else 0 end irp,
      case when (ventas*v_factor+piso)>0 then round(ventas*v_factor/(ventas*v_factor+piso)*100,1) else 0 end irp_proy
    from base where piso>0 or total>0 or ventas>0
  )
  select json_build_object(
    'week',p_week,'from',v_start,'to',v_end,'dias_mes',v_dim,
    'rows',(select coalesce(json_agg(json_build_object(
       'store',store,'piso',piso,'almacen',almacen,'total',total,
       'pct_piso',pct_piso,'ventas',ventas,'irp',irp,'irp_proy',irp_proy) order by ventas desc),'[]') from calc),
    'tot',(select json_build_object(
       'piso',coalesce(sum(piso),0),'almacen',coalesce(sum(almacen),0),'total',coalesce(sum(total),0),
       'ventas',coalesce(sum(ventas),0),
       'pct_piso',case when sum(total)>0 then round(sum(piso)/sum(total)*100,1) else 0 end,
       'irp',case when (sum(ventas)+sum(piso))>0 then round(sum(ventas)/(sum(ventas)+sum(piso))*100,1) else 0 end,
       'irp_proy',case when (sum(ventas)*v_factor+sum(piso))>0 then round(sum(ventas)*v_factor/(sum(ventas)*v_factor+sum(piso))*100,1) else 0 end) from calc)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- floor_breakdown: piso por dimensión (resp/gender/mundo/linea/articulo)
-- ahora "vigente" (todo lo demás igual).
-- ---------------------------------------------------------------------------
create or replace function floor_breakdown(p_week text, p_store uuid, p_by text default 'resp')
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_start  date := comm_week_start(p_week);
  v_end    date := comm_week_start(p_week) + 6;
  v_dim    int  := extract(day from (date_trunc('month', comm_week_start(p_week)) + interval '1 month - 1 day'))::int;
  v_factor numeric := v_dim::numeric / 7;
  v_result json;
begin
  if current_role_name() not in ('admin','analista') then
    p_store := current_store_id();
    if p_store is null then raise exception 'Sin tienda asignada'; end if;
  end if;
  with dims as (
    select distinct on (sku) sku, resp, gender, mundo, sap_line as linea,
           article_code as articulo, units::numeric as stk
    from stock_snapshots where store_id = p_store order by sku, snapshot_date desc),
  piso as (
    select sku, sum(units)::numeric u
    from fixture_floor_vigente(p_store)
    group by sku),
  ven as (
    select sku, sum(units)::numeric u from sales_daily
    where store_id = p_store and sale_date between v_start and v_end group by sku),
  u as (select sku from dims union select sku from piso union select sku from ven),
  base as (
    select u.sku,
      coalesce(d.resp,'(sin responsable)') resp, coalesce(d.gender,'(sin género)') gender,
      coalesce(d.mundo,'(sin mundo)') mundo, coalesce(d.linea,'(sin línea)') linea,
      coalesce(d.articulo,'(sin artículo)') articulo,
      coalesce(p.u,0) piso, coalesce(d.stk,0) total, coalesce(v.u,0) ventas
    from u left join dims d on d.sku=u.sku left join piso p on p.sku=u.sku left join ven v on v.sku=u.sku),
  keyed as (
    select case p_by when 'gender' then gender when 'mundo' then mundo when 'linea' then linea
             when 'articulo' then articulo else resp end key,
           piso, greatest(total-piso,0) almacen, total, ventas from base),
  agg as (
    select key, sum(piso) piso, sum(almacen) almacen, sum(total) total, sum(ventas) ventas,
      case when (sum(ventas)+sum(piso))>0 then round(sum(ventas)/(sum(ventas)+sum(piso))*100,1) else 0 end irp,
      case when (sum(ventas)*v_factor+sum(piso))>0 then round(sum(ventas)*v_factor/(sum(ventas)*v_factor+sum(piso))*100,1) else 0 end irp_proy,
      case when sum(total)>0 then round(sum(piso)/sum(total)*100,1) else 0 end pct_piso
    from keyed group by key)
  select json_build_object('by',p_by,
    'rows',(select coalesce(json_agg(json_build_object('key',key,'piso',piso,'almacen',almacen,'total',total,'ventas',ventas,'irp',irp,'irp_proy',irp_proy,'pct_piso',pct_piso) order by ventas desc),'[]') from agg where piso>0 or total>0 or ventas>0),
    'tot',(select json_build_object('piso',coalesce(sum(piso),0),'almacen',coalesce(sum(almacen),0),'total',coalesce(sum(total),0),'ventas',coalesce(sum(ventas),0),
       'irp',case when (sum(ventas)+sum(piso))>0 then round(sum(ventas)/(sum(ventas)+sum(piso))*100,1) else 0 end,
       'irp_proy',case when (sum(ventas)*v_factor+sum(piso))>0 then round(sum(ventas)*v_factor/(sum(ventas)*v_factor+sum(piso))*100,1) else 0 end,
       'pct_piso',case when sum(total)>0 then round(sum(piso)/sum(total)*100,1) else 0 end) from keyed)
  ) into v_result;
  return v_result;
end $$;

-- ---------------------------------------------------------------------------
-- floor_detail / floor_detail_all: detalle por mueble ahora "vigente"
-- (filas con 0 unidades se omiten para no inflar el export con SKUs agotados).
-- ---------------------------------------------------------------------------
create or replace function floor_detail(p_week text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with role_store as (
    select case when current_role_name() in ('admin','analista') then null else current_store_id() end sid),
  alias as (select store_id, string_agg(distinct alias,' / ' order by alias) a from store_aliases group by store_id),
  lines as (
    select st.id as store_id, coalesce(f.name,'(sin mueble)') as fixture, ffn.sku, ffn.units
    from stores st
    cross join lateral fixture_floor_vigente(st.id) ffn
    left join fixtures f on f.id = ffn.fixture_id
    where ((select sid from role_store) is null or st.id = (select sid from role_store))
      and ffn.units > 0
  ),
  detail as (
    select st.name tienda, coalesce(al.a,'') tienda_archivo, l.fixture mueble, l.sku,
           sc.description descripcion, sc.talla, sc.color, sc.gender genero, snap.resp responsable, l.units unidades
    from lines l
    join stores st on st.id = l.store_id
    left join alias al on al.store_id = l.store_id
    left join stock_current sc on sc.store_id = l.store_id and sc.sku = l.sku
    left join lateral (select resp from stock_snapshots s where s.sku = l.sku and s.store_id = l.store_id
                       order by snapshot_date desc limit 1) snap on true
    order by st.name, l.fixture, l.sku)
  select coalesce(json_agg(row_to_json(detail)), '[]') from detail;
$$;

revoke all on function floor_detail(text) from public;
grant execute on function floor_detail(text) to authenticated;

create or replace function floor_detail_all(p_week text)
returns json language sql stable security definer set search_path = public, pg_temp as $$
  with alias as (select store_id, string_agg(distinct alias,' / ' order by alias) a from store_aliases group by store_id),
  lines as (
    select st.id as store_id, coalesce(f.name,'(sin mueble)') as fixture, ffn.sku, ffn.units
    from stores st
    cross join lateral fixture_floor_vigente(st.id) ffn
    left join fixtures f on f.id = ffn.fixture_id
    where ffn.units > 0
  ),
  detail as (
    select st.name tienda, coalesce(al.a,'') tienda_archivo, l.fixture mueble, l.sku,
           sc.description descripcion, sc.talla, sc.color, sc.gender genero, snap.resp responsable, l.units unidades
    from lines l
    join stores st on st.id = l.store_id
    left join alias al on al.store_id = l.store_id
    left join stock_current sc on sc.store_id = l.store_id and sc.sku = l.sku
    left join lateral (select resp from stock_snapshots s where s.sku = l.sku and s.store_id = l.store_id
                       order by snapshot_date desc limit 1) snap on true
    order by st.name, l.fixture, l.sku)
  select coalesce(json_agg(row_to_json(detail)), '[]') from detail;
$$;

revoke all on function floor_detail_all(text) from public, authenticated, anon;
