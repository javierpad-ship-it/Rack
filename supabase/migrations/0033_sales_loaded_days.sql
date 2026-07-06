-- ============================================================================
-- 0033 — Días con ventas realmente cargadas (para el calendario de import)
--
-- El calendario pintaba "todo día <= última fecha", lo que ocultaba huecos
-- internos (ej. junio borrado pero julio cargado seguía pintando junio). Esta
-- función devuelve las fechas DISTINTAS con ventas en un rango, para pintar
-- solo los días que de verdad tienen datos.
-- ============================================================================

create or replace function sales_loaded_days(p_from date, p_to date)
returns text[] language sql stable security definer set search_path = public, pg_temp as $$
  select coalesce(
    array_agg(distinct to_char(sale_date, 'YYYY-MM-DD') order by to_char(sale_date, 'YYYY-MM-DD')),
    '{}'
  )
  from sales_daily
  where sale_date between p_from and p_to;
$$;

revoke all on function sales_loaded_days(date, date) from public;
grant execute on function sales_loaded_days(date, date) to authenticated;
