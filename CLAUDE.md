# CLAUDE.md

Guía para trabajar en este repositorio.

## Qué es Rack

Solución multi-tienda para medir **rotación y venta por mueble**. Tres componentes:
- `supabase/` — PostgreSQL + RLS + lógica de negocio (atribución, métricas, almacén).
- `web/` — Next.js (App Router) + TypeScript: administración, import Excel, reportes, heatmap.
- `mobile/` — Android Kotlin + Compose: escaneo offline-first en **Honeywell ScanPal EDA52**.

Ver `README.md`, `docs/ARCHITECTURE.md` y `docs/ROADMAP.md`.

## Reglas de negocio clave (no romper)

- **Atribución de ventas por SKU exacto.** Si un SKU está en varios muebles esa semana, la venta va al
  **primer mueble escaneado** (orden por `scanned_at`). Implementado en `attribute_sales()`
  (`supabase/migrations/0002_attribution.sql`).
- **Almacén deducido** = stock total de la tienda − unidades escaneadas en piso (`store_warehouse()`).
- **Semana = ISO week** `IYYY-"W"IW` (ej. `2026-W26`). Hay tres implementaciones que DEBEN coincidir:
  `iso_week()` (SQL), `web/src/lib/week.ts`, `mobile/.../util/IsoWeek.kt`.
- **Sync idempotente** por `client_uid` en `scan_sessions`.

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
