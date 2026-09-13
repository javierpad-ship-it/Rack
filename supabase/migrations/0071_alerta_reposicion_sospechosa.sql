-- ============================================================================
-- 0071 — Alerta: reposición sospechosa (reconteo cargado como reposición)
--
-- Una reposición (kind='restock') SUMA unidades al último audit del mueble en
-- fixture_floor_vigente(). Si el operario vuelve a contar todo el mueble con
-- la app Repo en vez de Inventario, ese "reconteo" se suma y el piso se
-- infla (gotcha #13: RACK 07 de Prolongación, 296 u repuestas sobre 103
-- auditadas). Nadie lo veía. Esta alerta lo saca a la luz en /alerts
-- (pestaña operativa) para que se revise o se repita como auditoría.
--
-- Regla: una sesión de reposición de la semana cuyas unidades superan el 50 %
-- de la última auditoría del mueble (anterior a esa reposición). Si el mueble
-- no tiene auditoría previa, cualquier reposición de 20 u o más también alerta.
-- El ALMACÉN se excluye (reponer hacia él es salida de piso, no entrada).
-- ============================================================================

create or replace function store_alerts(p_store_id uuid, p_week text, p_prev_week text)
returns table (kind text, severity text, ref text, detail text)
language sql stable security definer set search_path = public, pg_temp as $$
  -- Reposición: hay stock en almacén pero el producto no llegó al piso.
  select 'reposicion'::text,
         'media'::text,
         w.sku,
         'En almacén ' || w.warehouse_units || ' u, sin unidades en piso'
  from store_warehouse(p_store_id, p_week) w
  where w.warehouse_units > 0 and w.floor_units = 0

  union all

  -- Muebles activos no escaneados esta semana.
  select 'mueble_sin_escanear',
         'alta',
         c.fixture_name,
         'No escaneado en ' || p_week
  from scan_coverage(p_store_id, p_week) c
  where c.scanned = false

  union all

  -- Caída de venta por mueble > 30% respecto a la semana previa.
  select 'caida_venta',
         'media',
         wow.fixture_name,
         'Venta ' || coalesce(wow.delta_pct, 0) || '% vs ' || p_prev_week
  from fixture_week_over_week(p_store_id, p_week, p_prev_week) wow
  where wow.delta_pct is not null and wow.delta_pct <= -30

  union all

  -- Reposición sospechosa: parece un reconteo completo cargado como reposición.
  select 'reposicion_sospechosa',
         'alta',
         r.fixture_name,
         'Reposición de ' || r.restock_units || ' u el ' || to_char(r.scanned_at, 'DD/MM HH24:MI')
           || case when r.audit_units is null
                   then ' sin auditoría previa'
                   else ' vs auditoría de ' || r.audit_units || ' u ('
                        || round(100.0 * r.restock_units / r.audit_units) || ' %)' end
           || ' — ¿reconteo cargado como reposición? Si es así, repetirlo desde Inventario.'
  from (
    select f.name as fixture_name, ss.scanned_at,
           (select sum(sl.quantity) from scan_lines sl where sl.session_id = ss.id)::int as restock_units,
           (select sum(sl2.quantity)::int
              from scan_sessions a
              join scan_lines sl2 on sl2.session_id = a.id
             where a.fixture_id = ss.fixture_id and a.kind = 'audit' and a.scanned_at < ss.scanned_at
               and a.id = (select a2.id from scan_sessions a2
                            where a2.fixture_id = ss.fixture_id and a2.kind = 'audit'
                              and a2.scanned_at < ss.scanned_at
                            order by a2.scanned_at desc limit 1)) as audit_units
    from scan_sessions ss
    join fixtures f on f.id = ss.fixture_id and not f.is_warehouse
    where ss.store_id = p_store_id and ss.kind = 'restock' and ss.week = p_week
  ) r
  where (r.audit_units is not null and r.restock_units > r.audit_units * 0.5)
     or (r.audit_units is null and r.restock_units >= 20);
$$;
