-- ============================================================================
-- 0072 — Hardening: RPCs no ejecutables sin login + precios por empresa
--
-- Revisión general de sep-2026 (docs/LECCIONES_Y_GOTCHAS.md #14):
--
--  A. El linter de Supabase marcaba 36 funciones SECURITY DEFINER ejecutables
--     por `anon` (sin sesión). Varias no verifican rol adentro
--     (fixture_floor_vigente, store_warehouse, scan_coverage, store_alerts,
--     generic_rotation, prisma_variant_lookup...): con la anon key y un uuid
--     de tienda se podía leer piso/stock/ventas sin loguearse. Se revoca
--     EXECUTE a anon/public en TODAS las funciones del esquema public y se
--     deja solo authenticated + service_role. Ningún cliente legítimo llama
--     RPCs como anon (login usa /auth, el resto va con JWT de usuario).
--  B. 27 funciones sin `search_path` fijo (riesgo de secuestro de objetos
--     por search_path). Se fija `public, pg_temp` en todas las que no lo
--     tengan.
--  C. Índices para FKs sin cobertura que sí se consultan (profiles.store_id,
--     price_proposals.store_id, scan_sessions.user_id).
--  D. generic_prices: la exportación a SAP grababa los precios aprobados con
--     `sales_org` y `empresa_id = NULL`, pero Prisma lee el vigente por
--     EMPRESA (generic_price_info_empresa). 877 precios aprobados y 25.459
--     históricos por Org nunca se veían en la app. Backfill idempotente:
--     empresa_id desde empresas.codigo_sap; en conflicto de fecha con una
--     fila por empresa, la propuesta gana y la fila por Org se borra. El
--     export (web) ahora graba empresa_id y upsertea por
--     (generic_code, empresa_id, valid_from).
-- ============================================================================

-- A. Sin RPC para anon --------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
  loop
    execute format('revoke execute on function %s from public, anon', r.sig);
    execute format('grant execute on function %s to authenticated, service_role', r.sig);
  end loop;
end $$;

-- Las que solo debe correr el service-role (0027) siguen sin authenticated.
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and p.proname in ('recompute_sales_week','recompute_sales_range','attribute_sales',
                        'recalc_fixture_metrics','apply_stock_snapshot','process_sales_daily',
                        'ensure_warehouse_fixture','stores_create_warehouse','handle_new_user',
                        'rls_auto_enable','fixtures_set_code','scan_sessions_set_week',
                        'scan_sessions_replace_dup')
  loop
    execute format('revoke execute on function %s from authenticated', r.sig);
  end loop;
end $$;

-- B. search_path fijo --------------------------------------------------------
do $$
declare r record;
begin
  for r in
    select p.oid::regprocedure as sig
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prokind = 'f'
      and (p.proconfig is null or not exists (select 1 from unnest(p.proconfig) c where c like 'search_path=%'))
  loop
    execute format('alter function %s set search_path = public, pg_temp', r.sig);
  end loop;
end $$;

-- C. Índices de FKs consultadas ----------------------------------------------
create index if not exists profiles_store_idx        on profiles(store_id);
create index if not exists price_proposals_store_idx on price_proposals(store_id);
create index if not exists scan_sessions_user_idx    on scan_sessions(user_id);

-- D. Precios por empresa (idempotente) ---------------------------------------
with e as (select id as empresa_id, codigo_sap from empresas),
fix_conf as (
  update generic_prices x
  set pvp = o.pvp, source = 'proposal'
  from generic_prices o join e on e.codigo_sap = o.sales_org
  where o.empresa_id is null and o.source = 'proposal'
    and x.generic_code = o.generic_code and x.empresa_id = e.empresa_id and x.valid_from = o.valid_from
  returning o.id as org_row_id
),
del_conf as (
  delete from generic_prices where id in (select org_row_id from fix_conf) returning id
)
update generic_prices gp
set empresa_id = e.empresa_id
from e
where gp.empresa_id is null and gp.sales_org = e.codigo_sap
  and gp.id not in (select org_row_id from fix_conf)
  and not exists (select 1 from generic_prices x
                   where x.generic_code = gp.generic_code and x.empresa_id = e.empresa_id
                     and x.valid_from = gp.valid_from);
