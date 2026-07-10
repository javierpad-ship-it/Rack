# Lecciones y gotchas (bugs resueltos — no repetir)

> Trampas reales que ya nos costaron tiempo. Leer antes de tocar import, SKU,
> semana, escaneo/sync o reportes.

## #1 — SKU con ceros a la izquierda (padding del POS)

**Síntoma:** ventas/piso no cruzan con stock; todo cae en "(sin responsable)";
o `sales_daily` se duplica al recargar.

**Causa:** el POS exporta `CODIGO_VARIANTE` con padding (`000001000000358024`),
pero otras cargas/el stock vienen sin ceros (`1000000358024`). Distinto texto =
no cruza y = clave distinta (se duplica en vez de sobrescribir).

**Regla:**
- Al **importar** (web) se normaliza con `normSku()` (`parseExcel.ts`): quita
  ceros a la izquierda en códigos puramente numéricos, deja alfanuméricos igual.
- Al **leer** en SQL se usa `norm_sku()` sobre el SKU del **escaneo** (que llega
  con ceros del equipo) en `floor_breakdown`, `floor_detail(_all)`, `alert_drill`.
- La data histórica se canonizó una vez (`0038`), fusionando duplicados por tabla
  antes de normalizar (para no violar los únicos).

**NUNCA** normalizar `scan_lines.sku` con un **trigger de escritura** → ver #2.

## #2 — El trigger de normalización rompió la sincronización del escaneo

**Síntoma:** el header de la sesión sincroniza pero las líneas quedan en **0**;
la app muestra "Sesiones sin sincronizar" que no bajan. Log de Postgres:
`ON CONFLICT DO UPDATE command cannot affect row a second time`.

**Causa:** la app sube las líneas con un **upsert por lote** (`INSERT … ON
CONFLICT (session_id, sku) DO UPDATE`). Un trigger `BEFORE INSERT` que normaliza
el SKU hacía que **dos códigos distintos del mismo mueble colapsaran al mismo
SKU** dentro del mismo statement → Postgres no puede tocar la misma fila dos veces
→ falla todo el lote de líneas.

**Fix (`0044`):** se **eliminó el trigger** y se normaliza el SKU **al leer** en
los reportes. Un `BEFORE` trigger no puede fusionar filas del mismo statement, así
que es incompatible con el upsert por lote. Lección: no transformar claves de
escritura que la app usa como conflict target.

## #3 — Fechas DD/MM se perdían (días 1–12 del mes)

**Síntoma:** al cargar ventas, entraban solo del día 13 en adelante; faltaban
~días 1–12 de cada mes.

**Causa:** `xlsx` interpretaba las fechas con **día ≤ 12** como MM/DD (US) y las
convertía a serial numérico → `normalizeDate` las descartaba. Los días > 12 (mes
imposible en MM/DD) quedaban como texto y sí cargaban.

**Fix:** leer el libro con **`raw: true`** (las fechas quedan como texto
`DD/MM/AAAA`) y `normalizeDate` además decodifica seriales de Excel. Test de
regresión en `parseExcel.test.ts`.

## #4 — Límite de 1000 filas de PostgREST en exports

**Síntoma:** el CSV/export traía menos de lo real (se cortaba en 1000 filas).

**Causa:** una función que devuelve **tabla** (`returns setof`/`returns table`)
la sirve PostgREST con el límite por defecto de 1000 filas.

**Fix:** las funciones de export devuelven **un único JSON** (`json_agg`), sin
tope de filas (`floor_detail`, `floor_detail_all`). Cambiar de `returns table` a
`returns json` requiere `drop function` previo.

## #5 — Fotos de stock parciales / múltiples por tienda

**Síntoma:** SKUs escaneados sin responsable aunque existían en una foto anterior.

**Causa:** el reporte tomaba el snapshot **más reciente global**, que a veces es
parcial (menos SKUs).

**Fix:** `floor_breakdown` resuelve atributos y stock por el **último snapshot que
contiene cada SKU** (`distinct on (sku) … order by snapshot_date desc`). Robusto a
fotos parciales sin borrar datos.

## #6 — Semana comercial vs ISO / tres implementaciones

La semana es **comercial (dom→sáb)** anclada en `week_calendar`, NO ISO. Debe
coincidir en SQL (`comm_week`), `web/src/lib/week.ts` y `mobile IsoWeek.kt`. Si el
móvil etiqueta distinto que el servidor, los reportes por semana no cuadran.

## #7 — service-role y `current_role_name()`

El export nocturno corre con **service-role** (sin usuario), donde el gating por
rol falla. Por eso existe `floor_detail_all` **sin filtro de rol** (no otorgada a
`authenticated`), llamada solo desde `/api/export/floor` protegido por token.

## #8 — Límite de tamaño de Server Actions (Next.js)

Los archivos grandes de import se **agregan/deduplican en el navegador** y se
suben **por lotes** (`appendSalesDaily`), con el recálculo una sola vez al final,
para no exceder el límite de body de los Server Actions.

## #9 — Una sesión de escaneo trabada bloqueaba a las demás

**Síntoma:** varias sesiones quedan "sin sincronizar" en el equipo aunque haya
señal; algunas suben y otras no, de forma persistente.

**Causa:** el `SyncWorker` recorría las sesiones pendientes en un solo bucle sin
try/catch por sesión: si una fallaba (por cualquier motivo), la excepción
abortaba el bucle y **las de atrás no se intentaban**.

**Fix (commit `121e38c`, mobile v0.1.2):** cada sesión se sube de forma
**independiente**; si una falla, se saltea y se sigue con el resto (solo la
trabada queda pendiente). El refresh de token por 401 se maneja por sesión y el
pull de catálogo pasa a no-crítico. **Requiere APK nuevo** para que tome efecto.

## #10 — Recrear muebles rompe la sincronización del escaneo (FK)

**Síntoma:** sesiones de ciertos muebles no sincronizan **ni el header**, aunque
el mueble "existe" por nombre.

**Causa:** `scan_sessions.fixture_id` tiene FK a `fixtures(id)`. Si los muebles se
**borran y recrean** (import de plano, edición masiva), cambia su `id`. El equipo
tiene el `id` viejo cacheado offline; al sincronizar una sesión escaneada con ese
id, la **FK la rechaza** y queda trabada para siempre.

**Regla:** los muebles se **editan en su lugar**, NUNCA se borran y recrean (el
`id` no debe cambiar). Recuperación de sesiones trabadas por esto: soltar la FK
temporal (`alter table scan_sessions drop constraint <fk>`) → sincronizar (entran
como huérfanas con el id viejo) → `update` del `fixture_id` al id nuevo (matcheando
por `scanned_at`) → re-agregar la FK. Combinar con el fix #9 (APK) para que no
bloquee a las demás.

## Conector Supabase (operativo, no del producto)

En sesiones de chat el conector MCP a veces figura `enabledInChat: false` (apagado
para el chat aunque conectado). Si `apply_migration`/`execute_sql` no cargan, se
aplican los SQL manualmente en el **SQL Editor** del dashboard.
