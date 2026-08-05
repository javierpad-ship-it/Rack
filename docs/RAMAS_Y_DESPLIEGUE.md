# Ramas y despliegue — para no confundirse

Este es **un solo repositorio** (`javierpad-ship-it/rack`) con **cuatro carpetas** (`supabase/`,
`web/`, `mobile/`, `prisma/`) pero **tres ramas activas**, porque cada destino de despliegue
(Railway ×2, GitHub Actions ×1) está conectado a una rama distinta. El motivo histórico: `prisma/`
se agregó después y Railway lo apuntó a su propia rama en vez de a la rama principal — así se quedó.

## Las tres ramas

| Rama | Qué despliega | A dónde | Cuándo pushear ahí |
|---|---|---|---|
| **`claude/eager-turing-1owj88`** | `web/` + migraciones de `supabase/` | Railway (servicio "web") + Supabase Cloud | Rama de trabajo por defecto. Todo commit va acá primero. |
| **`claude/prisma-web-app-3rw1uv`** | `prisma/` | Railway (servicio "Prisma", PWA de precios) | Solo cuando un cambio de `prisma/` ya probado debe salir a producción. Dispara redeploy en Railway. |
| **`claude/prisma-dev`** *(nueva)* | — (no está conectada a ningún despliegue) | ninguno | Rama de trabajo para el **evolutivo de Prisma**: features nuevas de `prisma/` que todavía no deben tocar producción. |
| — | `mobile/` (APK) | GitHub Actions (`android.yml`), no una rama fija | El workflow corre sobre cualquier rama/push que toque `mobile/**`; no depende de sincronizar nada. |

`claude/prisma-web-app-3rw1uv` es **ancestro** de `claude/eager-turing-1owj88` (se separaron después
de un merge), pero desde ahí son independientes: **no se sincronizan solas**. Un commit sobre
`prisma/` hecho en `claude/eager-turing-1owj88` se queda ahí hasta que alguien lo empuje a mano a
`claude/prisma-web-app-3rw1uv` (fast-forward, porque es ancestro):

```bash
git push origin claude/eager-turing-1owj88:claude/prisma-web-app-3rw1uv
```

**Esto dispara un redeploy en Railway** — pedir confirmación antes de hacerlo (ver gotcha #11 en
`LECCIONES_Y_GOTCHAS.md`).

## Flujo recomendado para trabajar en Prisma

1. Cambios de `prisma/` que son parte del **evolutivo** (features en construcción, todavía no listas
   para tienda): commitear en **`claude/prisma-dev`**.
2. Cuando una tanda de cambios está probada y lista para producción: traerla a
   `claude/eager-turing-1owj88` (si no estaba ya ahí) y de ahí sincronizar a
   `claude/prisma-web-app-3rw1uv` con el comando de arriba.
3. `claude/prisma-web-app-3rw1uv` queda siempre como "lo que está en producción ahora mismo" — no se
   commitea directo ahí salvo para promover un cambio ya probado.

Cambios de `web/` o `supabase/` siempre van directo a `claude/eager-turing-1owj88` (esa rama despliega
ambos al toque).

## Verificar en qué quedó cada rama

```bash
git fetch origin claude/eager-turing-1owj88 claude/prisma-web-app-3rw1uv claude/prisma-dev
git log --oneline -1 origin/claude/eager-turing-1owj88
git log --oneline -1 origin/claude/prisma-web-app-3rw1uv
git log --oneline -1 origin/claude/prisma-dev
```

Si `claude/prisma-web-app-3rw1uv` no tiene el último commit que toca `prisma/`, ese cambio **no está
en producción** aunque ya esté pusheado en otra rama.

## Ver también

- `docs/DEPLOY.md` — guía paso a paso de cómo se conecta cada servicio de Railway y Supabase.
- `docs/LECCIONES_Y_GOTCHAS.md` (#11) — el incidente que motivó documentar esto: cambios en `prisma/`
  que "desaparecían" en producción porque se pusheaban solo a `claude/eager-turing-1owj88`.
- `prisma/README.md` — estructura de la app Prisma en sí.
