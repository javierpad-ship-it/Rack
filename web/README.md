# Rack — Web de administración

Next.js (App Router) + TypeScript, conectada a Supabase.

## Setup

```bash
cd web
npm install
cp .env.local.example .env.local   # completar con datos del proyecto Supabase
npm run dev
```

## Scripts
- `npm run dev` — desarrollo en http://localhost:3000
- `npm run build` / `npm start` — producción
- `npm test` — tests (Vitest)

## Estructura
- `src/lib/supabase/` — clientes (browser, server, admin/service-role).
- `src/lib/import/` — parser de Excel/CSV (catálogo, ventas, stock).
- `src/lib/week.ts` — semana ISO (espejo de `iso_week()` en SQL).
- `src/middleware.ts` — refresh de sesión + protección de rutas.
- `src/app/login/` — login.
- `src/app/(dashboard)/` — área autenticada (resumen, import, etc.).

## Despliegue
Pensado para **Railway** (Root Directory `web`, build Nixpacks vía `railway.json`; env vars del
`.env.local.example`). Supabase Cloud como backend. Ver `docs/DEPLOY.md`.
