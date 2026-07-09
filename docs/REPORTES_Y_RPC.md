# Catálogo de funciones SQL (RPC) y reportes

> Firma, qué hace, dónde se usa. Todas son `security definer` y respetan el rol:
> `admin`/`analista` ven todas las tiendas; el resto queda forzado a su
> `current_store_id()`. Al modificar una, actualizar acá.

## Rotación (IRP)

### `rotation_report(p_from, p_to, p_group_by, p_store, p_gender, p_mundo, p_embarque, p_brand, p_linea, p_resp) → json`
Reporte de rotación agrupado por `p_group_by` ∈ `resp|linea|brand|mundo|gender`.
Devuelve `{ snap, complete, days_total, days_elapsed, group_by, kpis, rows,
price_hm, talla_hm }`. Cada fila y celda de heatmap trae `irp` e `irp_proy`
(regla de 3). El stock del período = último `stock_snapshots <= p_to`.
Usado en `/rotation` (pestaña Resumen). Migración base `0030`/`0034`.

### `rotation_stores(p_from, p_to, filtros…) → json`
Igual pero por tienda: `{ rows, price_hm, talla_hm }` con `grp` = tienda.
Usado en `/rotation` (pestaña Por tienda). Base `0031`/`0034`.

### `rotation_filters() → json`
Opciones de filtro (`resp`, `gender`, `mundo`, `embarque`, `brand`, `linea`).
Una sola pasada sobre el último snapshot. Base `0028`.

## Piso de venta vs Almacén

Piso = Σ `scan_lines.quantity` de la semana. Almacén = stock − piso.
Rotación piso (IRP) = ventas / (ventas + piso) × 100. Proyección al mes:
ventas × (días_mes / 7).

### `floor_vs_warehouse(p_week) → json`
Por tienda: `{ rows:[{store, piso, almacen, total, pct_piso, ventas, irp,
irp_proy}], tot }`. Stock total desde `store_stock[semana]` o `stock_current`.
Usado en `/floor` (tabla principal). Base `0032`.

### `floor_breakdown(p_week, p_store, p_by) → json`
Detalle de una tienda por dimensión `p_by` ∈ `resp|gender|mundo|linea|articulo`:
piso/almacén/total/ventas/IRP + participación. Los atributos y el stock salen del
**último snapshot que contiene cada SKU** (robusto a fotos parciales). Normaliza
el SKU del escaneo al leer (`norm_sku`). Usado en `/floor` (entrar a una tienda).
Base `0037`/`0040`/`0044`.

### `floor_detail(p_week) → json` (rol-gated) · `floor_detail_all(p_week) → json` (service-role)
Detalle plano por (tienda, mueble, SKU) del piso: tienda Rack One + tienda del
archivo (alias) + descripción/talla/color/género/responsable + unidades.
`floor_detail` es para el **botón Exportar CSV** de `/floor`; `floor_detail_all`
(sin filtro de rol, no otorgada a `authenticated`) es para el **export nocturno**
por `/api/export/floor`. Devuelven **JSON** (no tabla) para evitar el corte a 1000
filas de PostgREST. LEFT JOIN a `fixtures` → mueble `(sin mueble)` si no existe.
Base `0036`/`0039`/`0041`/`0042`/`0043`/`0044`.

## Alertas

### `alert_drill(p_from, p_to, p_store, p_next, p_resp, p_mueble, p_gender, p_mundo, p_linea, p_articulo, p_talla, p_sku) → json`
Drill-down jerárquico lazy: `resp → mueble → gender → mundo → linea → articulo →
talla → sku`. El cliente pasa el camino ya elegido (filtros) y pide agrupar por
`p_next`. Devuelve `{ next, rows:[{key, cant, val, mg, stk, stk_val, irp,
irp_proy, mgn}], tot }`. Mueble = última ubicación escaneada del SKU (normaliza al
leer). Usado en `/alerts` (pestaña Drill-down). Base `0035`/`0044`.

### `store_alerts(p_store_id, p_week, p_prev_week) → setof`
Alertas operativas: reposición, mueble sin escanear, caída de venta.
Usado en `/alerts` (pestaña Operativas). Base `0008`.

## Semana comercial

- `comm_week(date|timestamptz) → text` — etiqueta `YYYY-Www` (dom→sáb).
- `comm_week_start(week) → date` — domingo de inicio.
- `current_comm_week() → text` — semana en curso (default en pantallas).
- Debe coincidir con `web/src/lib/week.ts` y `mobile IsoWeek.kt`. Base `0014`.

## Import / calendario

- `sales_loaded_days(p_from, p_to) → text[]` — fechas DISTINTAS con ventas
  cargadas (calendario por día real de `/import`). Base `0033`.
- `recompute_sales_range(store, from, to)` / `recompute_sales_week(store, week)` —
  reconstruyen `sales` semanal desde `sales_daily` y disparan atribución.
- `apply_stock_snapshot(store, date)` — refresca almacén de la semana de la foto.

## Piso / almacén / muebles (Fase 1)

- `store_warehouse(store, week) → setof` — por SKU: total, piso, almacén deducido.
- `attribute_sales(store, week)` — atribuye ventas al primer mueble escaneado.
- `recalc_fixture_metrics(store, week)` — `weekly_fixture_metrics` (piso = escaneado − vendido).
- `fixture_week_over_week`, `fixture_monthly_metrics`, `fixture_trends`,
  `scan_coverage`, `unattributed_sales`.

## Utilidad / seguridad

- `norm_sku(text) → text` — quita ceros a la izquierda en códigos numéricos
  (canoniza SKU). Base `0038`. **Usar al LEER, nunca en trigger de escritura** (gotcha #1).
- `current_role_name() → text`, `current_store_id() → uuid` — gating de RLS/roles.
