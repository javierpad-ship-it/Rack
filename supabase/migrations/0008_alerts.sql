-- ============================================================================
-- Rack — Fase 2: alertas operativas
-- Combina señales útiles para acción semanal.
-- ============================================================================

create or replace function store_alerts(p_store_id uuid, p_week text, p_prev_week text)
returns table (kind text, severity text, ref text, detail text)
language sql stable security definer as $$
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
  where wow.delta_pct is not null and wow.delta_pct <= -30;
$$;
