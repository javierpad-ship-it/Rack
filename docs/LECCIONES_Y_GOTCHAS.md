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

**Agravante encontrado (El Sol, ago-2026):** el bug no era solo la FK — el
equipo **nunca se recupera solo**, ni reintentando para siempre. `upsertFixtures()`
(Room, `RackDao`) insertaba por `id` con `REPLACE`: si el mueble se recreó (id
nuevo, mismo `barcode`), la fila **vieja nunca se borraba** del caché local,
quedaba para siempre junto a la nueva. `findFixtureByBarcode()` no tenía
`ORDER BY`, así que podía devolver cualquiera de las dos filas con ese barcode
— si agarraba la vieja, **cada escaneo nuevo** (no solo los de antes de la
recreación) seguía mandando el `fixture_id` viejo, y quedaba trabado para
siempre aunque se reintentara sync manualmente mil veces. Se manifestó como
"no sincroniza nada, ni probando de nuevo ahora mismo".

**Fix de raíz (mobile, `RackDao.replaceFixturesForStore`):** cada `pullCatalog()`
ahora **borra todos los muebles de la tienda en el caché local antes de volver a
insertar** los que manda el servidor, en vez de solo upsertear por id. Así, la
próxima vez que el equipo haga un pull exitoso (periódico, cada 15 min, o al
loguearse), el caché se auto-corrige solo — ya no hace falta borrar datos de la
app a mano cada vez que se recree un mueble. **Requiere APK nuevo** para tomar
efecto en los equipos ya instalados; mientras tanto, recuperación inmediata:
Ajustes → Apps → Rack One → Almacenamiento → Borrar datos (o desinstalar/
reinstalar) + volver a loguear.

## #11 — Prisma despliega desde una rama distinta a `web/`/`supabase/`

**Síntoma:** se hacen cambios en `prisma/` (o en algo que Prisma necesita en
runtime), se commitea y pushea a la rama de trabajo, se avisa "listo" — pero en
producción Prisma sigue mostrando la versión vieja. Cambios que "desaparecen".

**Causa:** en Railway hay **dos servicios con distinta rama de origen**:
- `web` (Rack One admin) despliega desde **`claude/eager-turing-1owj88`**.
- **`prisma` despliega desde `claude/prisma-web-app-3rw1uv`**, una rama aparte.

Como `claude/prisma-web-app-3rw1uv` es ancestro de `claude/eager-turing-1owj88`
(el trabajo de Prisma se mergeó una vez hacia acá), es fácil asumir que ambas
ramas se mantienen sincronizadas solas — **no es así**: son independientes desde
el merge, y cualquier commit nuevo sobre `prisma/` en `claude/eager-turing-1owj88`
se queda ahí hasta que se empuje explícitamente a `claude/prisma-web-app-3rw1uv`.

**Regla:** después de tocar `prisma/` (o una migración que la app de campo
consume), **confirmar con el usuario y sincronizar `claude/prisma-web-app-3rw1uv`**
(fast-forward simple, ya que es ancestro: `git push origin
claude/eager-turing-1owj88:claude/prisma-web-app-3rw1uv`) — dispara un redeploy
en Railway, así que se pide confirmación antes de pushear ahí. Antes de asumir
"ya está desplegado", verificar en Railway → servicio Prisma → Settings →
Source qué rama tiene configurada.

## #12 — Refresh token inválido dejaba el sync trabado en silencio

**Síntoma:** uno o dos equipos muestran "Sincronizando…" indefinidamente para
un puñado de sesiones puntuales (no todas), con buena señal y sin que otros
equipos de la misma tienda tengan problema. Los muebles afectados no siguen
ningún patrón (no son los últimos creados ni comparten nada obvio).

**Causa:** el access token de Supabase caduca (~1h) y `SyncWorker` lo renueva
con el refresh token (`renewToken()`). Si ese refresh token queda **inválido**
(Supabase Auth lo marca "Already Used" si hay una carrera renovación/crash de
la app justo después de pedirlo y antes de persistir el nuevo par), el
`POST /auth/v1/token?grant_type=refresh_token` empieza a devolver **400** para
siempre. `renewToken()` devolvía `false` sin limpiar nada, así que el equipo
reintentaba con el mismo token muerto en cada sync periódico, sin que la UI
avisara — quedaba "logueado" indefinidamente aunque el servidor ya no lo
reconociera. Diagnosticado viendo **Supabase → Logs → API Logs**: patrón
`POST scan_sessions 401` → `POST /auth/v1/token 400` → `GET fixtures 401`
repetido cada pocos minutos.

**Fix (`91c25ce`):** si el refresh falla con 401/400, `renewToken()` limpia la
sesión (`session.clear()`). `MainActivity` además revisa `isLoggedIn` al
volver a primer plano (`ON_RESUME`), no solo al abrir la app, así que en
cualquier caso el equipo termina mandando a loguear de nuevo en vez de
quedarse mudo. **Recuperación inmediata sin esperar el APK nuevo:** cerrar
sesión manualmente y volver a loguear en el equipo afectado — los escaneos
pendientes ya guardados localmente no se pierden y suben solos apenas hay
sesión válida. **Requiere APK nuevo** (CI) para que el fix tome efecto solo.

## #13 — Piso inflado en todas las tiendas: huérfanas + ventas nunca descontadas + recálculo cortado

**Síntoma (sep-2026):** "no está bajando del stock las unidades vendidas" y "se duplicó el
stock de piso" en Prolongación Iquitos. Al medirlo, el piso superaba al stock del POS en
**todas** las tiendas (Prolongación: 2.973 u de más, 47 % de los SKUs). Ejemplo trazado: SKU
`1000103460001` → piso 52 = 31 (PARED B03, auditoría real) + 21 (auditoría del 6/7 sobre un
mueble que ya no existía).

**Cuatro causas que se sumaban (diagnóstico en `supabase/migrations/0070_*.sql`):**
1. **Auditorías huérfanas contadas como piso.** Los muebles de Prolongación se borraron y
   recrearon el 24/8 (pantalla `/fixtures`, borrado duro con un confirm). Quedaron 29 auditorías
   (3.602 u) apuntando a ids inexistentes; `fixture_floor_vigente()` no filtraba por muebles
   existentes. **La FK de `scan_sessions.fixture_id` no existía**: se soltó en la recuperación
   del gotcha #10 y nunca se repuso, así que nada avisaba.
2. **Las ventas nunca se descontaban.** `attribute_sales()` solo asignaba mueble si el SKU se
   escaneó **esa misma semana** (incompatible con auditoría mensual) y comparaba SKU crudo
   contra normalizado (4 % de las lecturas vienen con ceros a la izquierda). Resultado medido:
   **100 % de las atribuciones sin mueble en 7 de 11 tiendas**, <12 % en las otras 4. Sin
   `fixture_id`, el `sold` de `fixture_floor_vigente()` no resta nada.
3. **Nada sacaba unidades del piso.** La ubicación "almacén" descrita en CLAUDE.md no existía en
   datos; "reponer a almacén" no restaba. Entre auditorías el piso solo subía (y un reconteo
   cargado como reposición se suma: RACK 07 tenía 296 u "repuestas" sobre 103 auditadas).
4. **Recálculo de ventas cortado desde el 18/8.** `sales_daily` estaba al 3/9, pero `sales` y
   `sales_attribution` terminaban en la W33. El import del 4/9 insertó los diarios y **murió en
   `recompute_sales_range`** ("canceling statement due to statement timeout"): corre por
   PostgREST con `service_role`, que hereda el `statement_timeout = 8s` de `authenticator` — el
   30 s de la 0026 solo cubría `anon`/`authenticated`. Además `comm_week(sale_date)` en el WHERE
   no usaba índice. Pista para detectarlo: `import_logs` sin fila `sales_daily` pero
   `sales_daily.created_at` reciente (el log se escribe solo si el recálculo termina).

**Fix (0070):** `fixture_floor_vigente()` solo cuenta muebles existentes (no almacén) y resta lo
repuesto al ALMACÉN; FK `scan_sessions.fixture_id` **NOT VALID + ON DELETE RESTRICT** (tolera
huérfanas históricas, impide nuevas y bloquea borrar muebles con escaneos; `/fixtures` desactiva
en vez de borrar); ubicación **ALMACÉN por tienda** (`fixtures.is_warehouse`, trigger + backfill,
etiqueta imprimible desde Etiquetas); `attribute_sales()` con regla **"último mueble donde se vio
el SKU"** (misma semana → primer mueble, regla histórica) y `norm_sku()` en ambos lados;
`recompute_sales_week()` filtra por rango de fechas (índice) y `service_role` con
`statement_timeout = 120s`; `scan_coverage`/`recalc_fixture_metrics` excluyen el almacén.
También se descubrió que la **0021 nunca se aplicó** (`weekly_fixture_metrics.remaining_units` no
existía) — se agrega en 0070.

**Reparación de datos:** recálculo W27→hoy en las 10 tiendas con ventas (~1 s por tienda-semana).
Prolongación pasó de 2.973 a 732 u de exceso; huérfanas contadas: 0; atribución con mueble en
W35: 68 % (antes 0 %). El exceso restante en tiendas con auditoría reciente (Jirón, El Sol) son
ventas del 4/9 en adelante aún no importadas y diferencias de conteo/etiqueta, no un bug.

**Reglas:** (a) muebles nunca se borran; (b) al tocar `sales`/atribución, verificar `import_logs`
tras cada import; (c) cualquier RPC largo que corra con service-role debe caber en 120 s o
partirse por semana; (d) `list_migrations` de Supabase NO refleja lo aplicado a mano por SQL
Editor — verificar con `pg_proc`/`information_schema` antes de asumir que una migración existe;
(e) los reconteos cargados como reposición se detectan en `/alerts` → "Reposición sospechosa"
(`store_alerts`, 0071): la primera corrida encontró RACK 04 (297 u vs 295) y RACK 07 (295 u vs
103) en Prolongación — la corrección es cambiar esa sesión de `restock` a `audit`.

## Conector Supabase (operativo, no del producto)

En sesiones de chat el conector MCP a veces figura `enabledInChat: false` (apagado
para el chat aunque conectado). Si `apply_migration`/`execute_sql` no cargan, se
aplican los SQL manualmente en el **SQL Editor** del dashboard.
