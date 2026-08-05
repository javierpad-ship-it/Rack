# Prisma — PWA de consulta y propuesta de precios

Next.js (App Router) + TypeScript, PWA instalable (Chrome Android → "Añadir a pantalla de inicio").
Usa la **misma base Supabase** que Rack One (`web/`) — comparten `stores`, `stock_current`,
`sales_daily`, `profiles`, etc. — pero es un **servicio Railway aparte** con **su propia rama de
despliegue**. Ver `docs/RAMAS_Y_DESPLIEGUE.md` en la raíz del repo antes de pushear cambios acá:
un commit en la rama principal (`claude/eager-turing-1owj88`) **no llega solo** a producción de
Prisma.

## Qué hace

Cualquier usuario de tienda escanea el código de barras de una variante y ve:
- Precio vigente, rotación (IRP) del genérico a nivel cadena, stock/piso/almacén de esa variante.
- El resto de tallas/colores del mismo genérico en la tienda.
- Puede **proponer un nuevo precio** para el genérico; el responsable de línea lo revisa desde
  Rack One (`web/src/app/(dashboard)/price-proposals`) y decide aceptar / denegar / contraproponer.
- Los precios aceptados se exportan a SAP desde Rack One (`web/src/app/(dashboard)/price-export`).

## Setup

```bash
cd prisma
npm install
cp .env.local.example .env.local   # mismas credenciales Supabase que web/
npm run dev
```

## Estructura

- `src/app/login/`, `src/app/cambiar-clave/` — auth (con cambio de clave forzado en primer login).
- `src/app/tienda/` — selección de tienda activa (`getCurrentStore()` / `getSelectedStoreId()`).
- `src/app/(app)/page.tsx` — pantalla de escaneo.
- `src/app/(app)/ficha/[sku]/` — ficha de producto tras escanear (`prisma_variant_lookup` RPC).
  Muestra si el genérico ya tiene una propuesta de precio pendiente (`propuesta_pendiente`), sin
  bloquear que el usuario proponga otra.
- `src/app/(app)/proponer/[generic]/` — formulario para proponer un nuevo PVP.
- `src/app/(app)/propuestas/page.tsx` — propuestas del usuario actual y su estado.
- `src/components/Scanner.tsx` — captura de código de barras (cámara/teclado).
- `src/components/RegisterSW.tsx` — registro del service worker (PWA).
- `src/lib/supabase/` — clientes (browser, server); no usa service-role (eso vive en `web/`).

## Backend compartido

Las funciones/tablas que usa Prisma viven en `supabase/migrations/` junto con las de Rack One:
`price_proposals` (0048), `price_change_exports` (0049), RPCs `prisma_variant_lookup` /
`price_proposals_review` / `generic_price_info_empresa` (0050+). Cambios ahí son un solo backend
para ambas apps — no hace falta duplicar nada, pero sí revisar que no rompan a la otra.

## Despliegue

Railway, Root Directory `prisma`, misma estructura de `railway.json` que `web/`. Rama conectada:
**`claude/prisma-web-app-3rw1uv`**. Detalle completo en `docs/DEPLOY.md` (sección "2b — Prisma") y
`docs/RAMAS_Y_DESPLIEGUE.md`.
