# Cuestionario para resolver (decisiones tomadas con default durante el trabajo autónomo)

> Cada ítem se construyó con un **default razonable** para no frenar. Revisá y corregí lo que haga falta;
> luego ajusto el código.

## Abiertas desde el inicio
1. **Formato de los Excel** (catálogo, ventas, stock total): ¿qué columnas y nombres exactos?
   - _Default asumido:_ ver `docs/FORMATOS_IMPORT.md`.
2. **Definición de "semana"**: ¿ISO week o semana comercial (qué día empieza)?
   - _Default asumido:_ ISO week (`iso_week()` en `0002_attribution.sql`).
3. **Modelo Honeywell y versión de Android**: define la implementación final del scanner.
   - _Default asumido:_ integración por Honeywell DataCollection intents + fallback keyboard wedge.

## Decisiones tomadas durante el loop nocturno
<!-- El loop agrega aquí cada default que eligió, con fecha y archivo afectado. -->

- **2026-06-25** — Coordenadas de pines del mueble en el plano: se usan **normalizadas [0..1]**
  (independientes del tamaño de imagen). Archivo: `supabase/migrations/0001_init.sql` (`fixtures.pin_x/pin_y`).
- **2026-06-25** — Columnas aceptadas en los Excel: el parser admite varios alias por columna
  (ver `docs/FORMATOS_IMPORT.md`). Confirmar nombres reales del POS/ERP. Archivo: `web/src/lib/import/parseExcel.ts`.
- **2026-06-25** — Auth: login por **email/contraseña** de Supabase Auth (sin SSO). Archivo: `web/src/app/login/page.tsx`.
- **2026-06-25** — Import masivo se ejecuta con **service-role** desde Server Actions (solo rol admin). Archivo: `web/src/app/(dashboard)/import/actions.ts`.
- **2026-06-25** — Plano: bucket de Storage **`layouts` público** (lectura), escritura admin/visual. El pin se
  ubica con **clic sobre la imagen** (coordenadas normalizadas). Archivos: `supabase/migrations/0003_storage.sql`,
  `web/src/app/(dashboard)/layout/page.tsx`.
