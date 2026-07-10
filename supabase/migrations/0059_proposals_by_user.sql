-- ============================================================================
-- 0059 — Reporte: propuestas de precio por usuario (últimos N días)
--
-- Cuenta, por solicitante (Prisma), cuántas propuestas hizo y en qué estado:
-- aceptadas, pendientes (incluye contrapropuesta = aún sin cerrar) y
-- denegadas. Solo admin/analista (visión completa del equipo).
-- ============================================================================

create or replace function price_proposals_by_user(p_days int default 15)
returns json language plpgsql stable security definer set search_path = public, pg_temp as $$
declare
  v_from   date := current_date - (p_days - 1);
  v_result json;
begin
  if current_role_name() not in ('admin', 'analista') then
    raise exception 'Requiere rol admin o analista.';
  end if;

  with base as (
    select pp.id, pp.status, coalesce(pr.full_name, '(sin usuario)') as usuario
    from price_proposals pp
    left join profiles pr on pr.id = pp.requested_by
    where pp.created_at::date >= v_from
  ),
  agg as (
    select usuario,
           count(*) as total,
           count(*) filter (where status = 'aceptada') as aceptadas,
           count(*) filter (where status in ('pendiente','contrapropuesta')) as pendientes,
           count(*) filter (where status = 'denegada') as denegadas
    from base
    group by usuario
  )
  select json_build_object(
    'from', v_from, 'to', current_date,
    'rows', coalesce((
      select json_agg(json_build_object(
        'usuario', usuario, 'total', total, 'aceptadas', aceptadas,
        'pendientes', pendientes, 'denegadas', denegadas
      ) order by total desc) from agg
    ), '[]'::json),
    'tot', (
      select json_build_object(
        'total', coalesce(sum(total),0), 'aceptadas', coalesce(sum(aceptadas),0),
        'pendientes', coalesce(sum(pendientes),0), 'denegadas', coalesce(sum(denegadas),0)
      ) from agg
    )
  ) into v_result;

  return v_result;
end $$;

revoke all on function price_proposals_by_user(int) from public;
grant execute on function price_proposals_by_user(int) to authenticated;
