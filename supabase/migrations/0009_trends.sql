-- ============================================================================
-- Rack — Fase 2: tendencias (serie temporal de venta/rotación por mueble)
-- ============================================================================

-- Serie de las últimas N semanas registradas en weekly_fixture_metrics para una tienda.
-- Devuelve una fila por (mueble, semana) ordenada cronológicamente.
create or replace function fixture_trends(p_store_id uuid, p_weeks int default 8)
returns table (
  fixture_id   uuid,
  fixture_name text,
  week         text,
  units_sold   int,
  amount_sold  numeric,
  rotation     numeric
) language sql stable security definer as $$
  with weeks as (
    select distinct week
    from weekly_fixture_metrics
    where store_id = p_store_id
    order by week desc
    limit greatest(p_weeks, 1)
  )
  select
    f.id,
    f.name,
    m.week,
    m.units_sold,
    m.amount_sold,
    m.rotation
  from weekly_fixture_metrics m
  join fixtures f on f.id = m.fixture_id
  where m.store_id = p_store_id
    and m.week in (select week from weeks)
  order by f.name, m.week;
$$;

-- Ranking de muebles por venta (o rotación) en una semana.
create or replace function fixture_ranking(p_store_id uuid, p_week text)
returns table (
  fixture_id   uuid,
  fixture_name text,
  units_sold   int,
  amount_sold  numeric,
  rotation     numeric,
  rank_amount  bigint
) language sql stable security definer as $$
  select
    f.id,
    f.name,
    coalesce(m.units_sold, 0),
    coalesce(m.amount_sold, 0),
    m.rotation,
    rank() over (order by coalesce(m.amount_sold, 0) desc)
  from fixtures f
  left join weekly_fixture_metrics m
    on m.fixture_id = f.id and m.week = p_week
  where f.store_id = p_store_id and f.active = true
  order by coalesce(m.amount_sold, 0) desc;
$$;
