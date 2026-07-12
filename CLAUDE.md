# CLAUDE.md

Guía para trabajar en este repositorio.

## Qué es Rack

Solución multi-tienda para medir **rotación y venta por mueble**. Tres componentes:
- `supabase/` — PostgreSQL + RLS + lógica de negocio (atribución, métricas, almacén).
- `web/` — Next.js (App Router) + TypeScript: administración, import Excel, reportes, heatmap.
- `mobile/` — Android Kotlin + Compose: escaneo offline-first en **Honeywell ScanPal EDA52**.

Ver `README.md`, `docs/ARCHITECTURE.md` y `docs/ROADMAP.md`.

**Para levantar contexto rápido y no perder congruencia:**
`docs/ESTADO_DEL_SISTEMA.md` (índice: rutas, tablas, flujos), `docs/REPORTES_Y_RPC.md`
(catálogo de funciones SQL) y `docs/LECCIONES_Y_GOTCHAS.md` (bugs resueltos — leer
antes de tocar import/SKU/semana/sync/reportes). Mantenerlos al día al agregar features.

## Reglas de negocio clave (no romper)

- **Atribución de ventas por SKU exacto.** Si un SKU está en varios muebles esa semana, la venta va al
  **primer mueble escaneado** (orden por `scanned_at`). Implementado en `attribute_sales()`
  (`supabase/migrations/0002_attribution.sql`).
- **Almacén deducido** = stock total de la tienda − unidades escaneadas en piso (`store_warehouse()`).
- **Semana = ISO week** `IYYY-"W"IW` (ej. `2026-W26`). Hay tres implementaciones que DEBEN coincidir:
  `iso_week()` (SQL), `web/src/lib/week.ts`, `mobile/.../util/IsoWeek.kt`.
- **Sync idempotente** por `client_uid` en `scan_sessions`.
- **Piso de venta = las ubicaciones (muebles) creadas en la tienda.** Lo escaneado en esos muebles es
  el piso. Cada tienda tiene además una ubicación especial **`almacén`** (se crea automáticamente):
  lo que se "repone a almacén" es mercadería que **sale del piso de venta y vuelve al almacén**. El
  almacén deducido (`store_warehouse()`) sigue siendo stock total − piso escaneado.
- **Códigos:** `código genérico`/artículo = `article_code` (CODIGO_ARTICULO); `SKU`/variante =
  `sku` (CODIGO_VARIANTE). El SKU numérico se normaliza **sin ceros a la izquierda** al importar
  (`normSku()` en `web/src/lib/import/parseExcel.ts`) para que ventas y stock siempre crucen.

## Comandos

```bash
# Web
cd web && npm install && npm run dev
cd web && npm test                 # Vitest (parser Excel, semana ISO)

# Tests SQL (requiere DB con migraciones)
psql "$DATABASE_URL" -f supabase/tests/attribution_test.sql
psql "$DATABASE_URL" -f supabase/seed.sql   # datos de demo

# Android
cd mobile && ./gradlew assembleDebug        # requiere generar el wrapper una vez
cd mobile && ./gradlew test                 # tests JVM (IsoWeek)
```

## Convenciones

- **UI en español** (la usan operarios/encargados de tienda).
- Roles: `admin`, `analista`, `visual`, `encargado`, `operario`. La autorización vive en **RLS**
  (`supabase/migrations/0001_init.sql`); no reimplementar permisos en el cliente salvo UX.
- Operaciones masivas/admin en la web usan **service-role** desde Server Actions (`web/.../*/actions.ts`),
  nunca desde el cliente.
- El scanner está detrás de `ScannerProvider`; no acoplar la UI a Honeywell directamente. Equipo:
  **ScanPal EDA52** vía Intent API con auto-config (claim/release). Ver `docs/SCANNER_EDA52.md`.

## Decisiones con default pendientes de confirmar

Ver `docs/PREGUNTAS_PENDIENTES.md` (formato de Excel, definición de semana, modelo Honeywell, etc.).

## Git

- Rama de trabajo: `claude/eager-turing-1owj88`. Commitear y pushear cambios completos.
- No crear PRs salvo pedido explícito.
- **⚠️ Prisma (`prisma/`) se despliega en Railway desde OTRA rama: `claude/prisma-web-app-3rw1uv`,
  NO desde `claude/eager-turing-1owj88`.** `web/` y `supabase/` sí despliegan desde
  `claude/eager-turing-1owj88`. Si se toca algo dentro de `prisma/` (o una migración que Prisma
  necesita en runtime), el cambio **no llega a producción** hasta que también se empuje/mergee a
  `claude/prisma-web-app-3rw1uv` — confirmar con el usuario antes de pushear ahí (dispara un
  redeploy). Ver gotcha #11 en `docs/LECCIONES_Y_GOTCHAS.md`.
