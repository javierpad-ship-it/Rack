-- ============================================================================
-- 0066 — Fix: propuestas sin línea asignada (resp quedaba NULL)
--
-- createProposal (Prisma) buscaba el responsable con
-- stock_snapshots.generic_code = <genérico>, pero esa columna está NULL en
-- casi todas las filas (nunca se pobló por import — mismo patrón que 0051/
-- 0060: el genérico se DERIVA del sku, no vive en una columna). Por eso casi
-- toda propuesta nueva quedaba con resp=null y no se podía aceptar/denegar
-- ("Propuesta sin línea asignada").
--
-- resp_of_generic() resuelve el responsable por pv_generic(sku), consistente
-- con el resto del sistema. Se usa desde Prisma al crear la propuesta, y acá
-- se backfillean las propuestas existentes que quedaron sin resp.
-- ============================================================================

create or replace function resp_of_generic(p_generic text)
returns text language sql stable as $$
  select resp from stock_snapshots
  where pv_generic(sku) = p_generic and resp is not null
  order by snapshot_date desc
  limit 1;
$$;

revoke all on function resp_of_generic(text) from public;
grant execute on function resp_of_generic(text) to authenticated;

-- Backfill: propuestas pendientes/existentes que quedaron con resp NULL.
update price_proposals
set resp = resp_of_generic(generic_code)
where resp is null
  and resp_of_generic(generic_code) is not null;
