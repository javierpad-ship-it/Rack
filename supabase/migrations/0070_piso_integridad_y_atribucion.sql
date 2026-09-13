-- ============================================================================
-- 0070 — Integridad del piso + atribución compatible con auditoría mensual
--
-- Auditoría de sep-2026 (ver docs/LECCIONES_Y_GOTCHAS.md #13). El piso estaba
-- inflado en TODAS las tiendas por cuatro causas que se sumaban:
--
--  1. Auditorías "huérfanas": sesiones cuyo fixture_id apunta a muebles que se
--     borraron y recrearon. fixture_floor_vigente() las seguía contando como
--     piso vigente (Prolongación Iquitos: +3.365 u). La FK de
--     scan_sessions.fixture_id no existía (se soltó en la recuperación del
--     gotcha #10 y nunca se repuso) y /fixtures permitía borrado duro.
--  2. Las ventas nunca se descontaban: attribute_sales() solo asignaba mueble
--     si el SKU se escaneó ESA misma semana (incompatible con auditoría
--     mensual) y comparaba SKU crudo contra normalizado. Resultado: el 100 %
--     de las atribuciones sin mueble en 7 de 11 tiendas.
--  3. Nada sacaba unidades del piso: la ubicación "almacén" descrita en
--     CLAUDE.md no existía en datos. Reponer hacia el almacén no restaba.
--  4. recompute_sales_range corría bajo el statement_timeout de 8 s del rol
--     authenticator (el de 30 s de la 0026 solo cubría anon/authenticated) y
--     el filtro comm_week(sale_date) no usaba índice: el import del 4/9 cargó
--     los diarios y murió en el recálculo (sin sales ni atribución desde W34).
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. Ubicación especial ALMACÉN por tienda
-- ---------------------------------------------------------------------------
alter table fixtures add column if not exists is_warehouse boolean not null default false;
create unique index if not exists fixtures_one_warehouse_per_store
  on fixtures(store_id) where is_warehouse;

-- Crea (si falta) el mueble ALMACÉN de la tienda. Si la tienda no tiene
-- código (el trigger fixtures_set_code lo exige), se genera un barcode fijo.
create or replace function ensure_warehouse_fixture(p_store_id uuid)
returns uuid language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id   uuid;
  v_code text;
begin
  select id into v_id from fixtures where store_id = p_store_id and is_warehouse limit 1;
  if v_id is not null then return v_id; end if;

  select code into v_code from stores where id = p_store_id;
  if v_code is null or btrim(v_code) = '' then
    insert into fixtures (store_id, name, floor, is_warehouse, active, barcode)
    values (p_store_id, 'ALMACÉN', 1, true, true,
            'ALM' || upper(left(replace(p_store_id::text, '-', ''), 8)))
    returning id into v_id;
  else
    insert into fixtures (store_id, name, floor, is_warehouse, active)
    values (p_store_id, 'ALMACÉN', 1, true, true)
    returning id into v_id;
  end if;
  return v_id;
end $$;

create or replace function stores_create_warehouse()
returns trigger language plpgsql security definer set search_path = public, pg_temp as $$
begin
  perform ensure_warehouse_fixture(new.id);
  return new;
end $$;

drop trigger if exists stores_warehouse on stores;
create trigger stores_warehouse
  after insert on stores
  for each row execute function stores_create_warehouse();

do $$
declare r record;
begin
  for r in select id from stores loop
    perform ensure_warehouse_fixture(r.id);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- 2. FK de scan_sessions.fixture_id (NOT VALID: tolera huérfanas históricas,
--    valida inserts nuevos) + RESTRICT: un mueble con escaneos no se borra.
-- ---------------------------------------------------------------------------
alter table scan_sessions drop constraint if exists scan_sessions_fixture_id_fkey;
alter table scan_sessions
  add constraint scan_sessions_fixture_id_fkey
  foreign key (fixture_id) references fixtures(id) on delete restrict not valid;

-- ---------------------------------------------------------------------------
-- 3. Piso vigente: solo muebles existentes (no huérfanos, no almacén),
--    + reposiciones al mueble − ventas atribuidas − reposiciones AL ALMACÉN.
--
--    Lo repuesto al almacén (kind='restock' sobre el mueble is_warehouse)
--    sale del piso: se descuenta por SKU del mueble que más unidades tiene
--    de ese SKU y, si sobra, del siguiente (aproximación greedy; a nivel
--    tienda el total es exacto).
-- ---------------------------------------------------------------------------
create or replace function fixture_floor_vigente(p_store_id uuid)
returns table (fixture_id uuid, sku text, units int)
language sql stable security definer set search_path = public, pg_temp as $$
  with wh as (
    select id from fixtures where store_id = p_store_id and is_warehouse
  ),
  last_audit as (
    select distinct on (ss.fixture_id)
      ss.fixture_id, ss.id as session_id, ss.scanned_at, ss.week
    from scan_sessions ss
    join fixtures f on f.id = ss.fixture_id and not f.is_warehouse
    where ss.store_id = p_store_id and ss.kind = 'audit'
    order by ss.fixture_id, ss.scanned_at desc
  ),
  audit_qty as (
    select la.fixture_id, norm_sku(sl.sku) as sku, sum(sl.quantity)::int as qty
    from last_audit la
    join scan_lines sl on sl.session_id = la.session_id
    group by la.fixture_id, norm_sku(sl.sku)
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
           la.week as audit_week, la.scanned_at as audit_at
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
     and norm_sku(sa.sku) = g.sku and sa.week > g.audit_week
    group by g.fixture_id, g.sku
  ),
  -- Unidades movidas AL ALMACÉN de cada SKU después de la auditoría del mueble.
  to_wh as (
    select g.fixture_id, g.sku, coalesce(sum(sl.quantity), 0)::int as moved
    from gross g
    left join scan_sessions ss
      on ss.store_id = p_store_id and ss.kind = 'restock'
     and ss.fixture_id in (select id from wh) and ss.scanned_at > g.audit_at
    left join scan_lines sl on sl.session_id = ss.id and norm_sku(sl.sku) = g.sku
    group by g.fixture_id, g.sku
  ),
  ranked as (
    select g.fixture_id, g.sku,
           greatest(g.qty - coalesce(s.sold, 0), 0) as net,
           coalesce(w.moved, 0) as moved,
           coalesce(sum(greatest(g.qty - coalesce(s.sold, 0), 0))
             over (partition by g.sku order by g.qty desc, g.fixture_id
                   rows between unbounded preceding and 1 preceding), 0) as cum_prev
    from gross g
    left join sold  s on s.fixture_id = g.fixture_id and s.sku = g.sku
    left join to_wh w on w.fixture_id = g.fixture_id and w.sku = g.sku
  )
  select fixture_id, sku,
         greatest(net - least(net, greatest(moved - cum_prev, 0)), 0)::int as units
  from ranked;
$$;

-- ---------------------------------------------------------------------------
-- 4. Atribución de ventas: "último mueble donde se vio el SKU"
--    Regla nueva: si el SKU se escaneó en la semana de la venta, gana el
--    PRIMER mueble escaneado esa semana (regla histórica); si no, el ÚLTIMO
--    mueble (auditoría o reposición) donde se vio el SKU en una semana
--    anterior. SKU normalizado en ambos lados. El almacén nunca recibe venta.
-- ---------------------------------------------------------------------------
create or replace function attribute_sales(p_store_id uuid, p_week text)
returns integer language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_rows integer;
begin
  delete from sales_attribution where store_id = p_store_id and week = p_week;

  with seen as (
    select norm_sku(sl.sku) as nsku, ss.fixture_id, ss.week, ss.scanned_at
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    join fixtures f on f.id = ss.fixture_id and not f.is_warehouse
    where ss.store_id = p_store_id
      and sl.quantity > 0
      and ss.week <= p_week
  ),
  pick as (
    select distinct on (nsku) nsku, fixture_id
    from seen
    order by nsku,
             (week = p_week) desc,
             case when week = p_week then scanned_at end asc,
             scanned_at desc
  )
  insert into sales_attribution (store_id, fixture_id, sku, week, units, amount)
  select s.store_id, p.fixture_id, s.sku, s.week, s.units, s.amount
  from sales s
  left join pick p on p.nsku = norm_sku(s.sku)
  where s.store_id = p_store_id and s.week = p_week;

  get diagnostics v_rows = row_count;

  perform recalc_fixture_metrics(p_store_id, p_week);
  return v_rows;
end $$;

-- ---------------------------------------------------------------------------
-- 5. Recálculo semanal usando el índice (store_id, sale_date) en vez de
--    comm_week(sale_date) fila por fila.
-- ---------------------------------------------------------------------------
create or replace function recompute_sales_week(p_store_id uuid, p_week text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_from date := comm_week_start(p_week);
begin
  delete from sales where store_id = p_store_id and week = p_week;
  insert into sales (store_id, sku, week, units, amount)
  select store_id, sku, p_week, sum(units)::int, sum(amount)
  from sales_daily
  where store_id = p_store_id
    and sale_date between v_from and v_from + 6
  group by store_id, sku;
  perform attribute_sales(p_store_id, p_week);
end $$;

-- El recálculo corre por PostgREST con el service-role: PostgREST aplica los
-- ajustes del rol al cambiar de rol, así que este timeout es el que manda.
alter role service_role set statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- 6. Cobertura y métricas semanales: el almacén no es un mueble a auditar.
--    (La 0021 nunca se aplicó en producción: weekly_fixture_metrics no tenía
--    remaining_units. Se agrega acá para que recalc_fixture_metrics coincida.)
-- ---------------------------------------------------------------------------
alter table weekly_fixture_metrics add column if not exists remaining_units int not null default 0;

create or replace function scan_coverage(p_store_id uuid, p_week text)
returns table (
  fixture_id   uuid,
  fixture_name text,
  scanned      boolean,
  scanned_at   timestamptz,
  skus_count   int,
  units_count  int
) language sql stable security definer set search_path = public, pg_temp as $$
  select
    f.id,
    f.name,
    (s.id is not null) as scanned,
    s.scanned_at,
    coalesce(agg.skus_count, 0),
    coalesce(agg.units_count, 0)
  from fixtures f
  left join lateral (
    select ss.id, ss.scanned_at
    from scan_sessions ss
    where ss.fixture_id = f.id and ss.week = p_week and ss.kind = 'audit'
    order by ss.scanned_at desc
    limit 1
  ) s on true
  left join lateral (
    select count(*)::int as skus_count, coalesce(sum(sl.quantity), 0)::int as units_count
    from scan_lines sl
    where sl.session_id = s.id
  ) agg on true
  where f.store_id = p_store_id and f.active = true and not f.is_warehouse
  order by scanned asc, f.name;
$$;

create or replace function recalc_fixture_metrics(p_store_id uuid, p_week text)
returns void language plpgsql security definer set search_path = public, pg_temp as $$
begin
  delete from weekly_fixture_metrics where store_id = p_store_id and week = p_week;

  with exposed as (
    select ss.fixture_id, sum(sl.quantity)::int as exposed_units
    from scan_sessions ss
    join scan_lines sl on sl.session_id = ss.id
    where ss.store_id = p_store_id and ss.week = p_week
    group by ss.fixture_id
  ),
  sold as (
    select fixture_id,
           sum(units)::int   as units_sold,
           sum(amount)       as amount_sold
    from sales_attribution
    where store_id = p_store_id and week = p_week and fixture_id is not null
    group by fixture_id
  )
  insert into weekly_fixture_metrics
    (store_id, fixture_id, week, units_sold, amount_sold, exposed_units, remaining_units, rotation)
  select
    p_store_id,
    f.id,
    p_week,
    coalesce(sold.units_sold, 0),
    coalesce(sold.amount_sold, 0),
    coalesce(exposed.exposed_units, 0),
    greatest(coalesce(exposed.exposed_units, 0) - coalesce(sold.units_sold, 0), 0),
    case when coalesce(exposed.exposed_units, 0) > 0
         then round(coalesce(sold.units_sold, 0)::numeric / exposed.exposed_units, 4)
         else null end
  from fixtures f
  left join exposed on exposed.fixture_id = f.id
  left join sold    on sold.fixture_id = f.id
  where f.store_id = p_store_id
    and not f.is_warehouse
    and (exposed.fixture_id is not null or sold.fixture_id is not null);
end $$;
