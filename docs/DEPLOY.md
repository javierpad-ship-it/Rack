# Guía de despliegue

Stack: **Supabase** (DB + Auth + Storage) · **Railway** (web) · **APK** (app Android, por CI).
Objetivo: simple y económico para 10-50 tiendas.

> Un solo repo, tres ramas activas (cada servicio Railway apunta a la suya). Antes de pushear algo
> de `prisma/`, ver `docs/RAMAS_Y_DESPLIEGUE.md` para no confundir dónde queda cada cambio.

> **Sin entorno local.** Todo se hace desde el navegador (dashboards de Railway y Supabase) o por
> **GitHub Actions**. No hace falta instalar Node, Gradle ni la CLI de Supabase en ninguna PC.

## 1. Supabase (backend)

1. Crear un proyecto en https://supabase.com (región más cercana).
2. **Aplicar las migraciones en orden** (`supabase/migrations/0001_*.sql` … `0010_*.sql`). Dos vías,
   ambas **sin PC**:
   - **SQL Editor (cero setup):** abrir cada archivo del repo y pegar su contenido, en orden, en
     Project > SQL Editor > New query > Run.
   - **CI (automatizado):** disparar el workflow **`Supabase migrations`** (Actions >
     `supabase.yml` > Run workflow). Hace `supabase db push` y redeploya la función `ingest-sales`.
     Requiere los secrets `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `SUPABASE_PROJECT_REF`.
3. Crear el **usuario administrador inicial**: Authentication > Users > Add user.
   Luego en el SQL Editor, asignarle el rol:
   ```sql
   update profiles set role = 'admin' where id = '<uuid-del-usuario>';
   ```
4. Anotar de Project Settings > API: `Project URL`, `anon key` y `service_role key`.

> Tests de la lógica SQL (opcional, desde el SQL Editor o CI): pegar/aplicar
> `supabase/tests/attribution_test.sql` y `supabase/tests/monthly_test.sql`. Datos de demo:
> `supabase/seed.sql`.

## 2. Web (Railway)

La web Next.js vive en `web/` y apunta a Supabase Cloud por variables de entorno.

1. En https://railway.app: **New Project > Deploy from GitHub repo** y elegir este repo.
2. En el servicio, **Settings > Root Directory = `web`**. El build usa **Nixpacks** (autodetecta
   Next.js); el build/start ya están fijados en `web/railway.json` (`next build` + `next start -p $PORT`).
3. **Variables** (Service > Variables), las mismas que consume el código:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo server-side; Railway la mantiene secreta, nunca exponer)
4. Deploy. Cuando quede *healthy*, **Settings > Networking > Generate Domain** para obtener la URL
   pública. Cada push a la rama conectada redeploya automáticamente.

## 2b. Prisma — app instalable (Railway)

La PWA de consulta/propuesta de precios vive en `prisma/` y usa la **misma base Supabase** que Rack One.
Es un servicio Railway aparte, mismo patrón que la web:

1. Railway → **New Service > Deploy from GitHub repo** (el mismo repo; rama **`claude/prisma-web-app-3rw1uv`**
   — **DISTINTA** de la rama de la web/Supabase (`claude/eager-turing-1owj88`). Un cambio en `prisma/`
   pusheado solo a `claude/eager-turing-1owj88` **no llega a este servicio** hasta que también se
   empuje a `claude/prisma-web-app-3rw1uv` (ver gotcha #11 en `LECCIONES_Y_GOTCHAS.md`).
2. Service > **Settings > Root Directory = `prisma`**. Nixpacks autodetecta Next.js; build/start ya están en
   `prisma/railway.json` (`next build` + `next start -p $PORT`).
3. **Variables** (las mismas que Rack One, apuntan a la base "Rack one"):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo server-side)
4. Deploy → **Settings > Networking > Generate Domain**. Esa URL (HTTPS) es instalable: en Chrome Android
   “Añadir a pantalla de inicio”. Cada push a la rama redeploya.

> **Importar precios:** en la web de Rack One (Railway), entrar a **`/precios`** (rol admin), subir el export
> `PVP…csv`, elegir R050/R040/ambas e importar. Puebla `generic_prices` (historial por genérico y Org).

## 3. App Android (APK por CI)

Railway no compila ni hospeda apps Android. El APK lo genera **GitHub Actions** (sin PC):

1. Cargar los secrets del repo: `SUPABASE_URL` (`https://<ref>.supabase.co`) y `SUPABASE_ANON_KEY`.
2. Disparar el workflow **`Android APK`** (Actions > `android.yml` > Run workflow, o con cualquier push
   que toque `mobile/**`). El job genera el wrapper, corre los tests JVM, compila e inyecta esos secrets.
3. Descargar el artefacto **`rack-debug-apk`** (`app-debug.apk`) desde la página del run.
4. Instalar en cada **Honeywell ScanPal EDA52** por **MDM** o `adb install app-debug.apk`.
5. **Scanner:** no requiere configurar el equipo a mano — `HoneywellScannerProvider` reclama el imager
   (claim/release) y redirige las lecturas a la app. Si algo falla, usar el campo de captura (wedge).
   Detalle en `docs/SCANNER_EDA52.md`.

## 4. Puesta en marcha (operativa)

1. Admin: importar **catálogo** (Importar > Catálogo).
2. Admin: crear **tiendas** y **usuarios** (rol Visual, encargado, operario por tienda).
3. Visual: subir el **plano** de cada tienda y ubicar los **pines** de los muebles (con su código de barras).
4. Operario: escaneo **semanal** de muebles desde la app.
5. Admin: importar **ventas** (y **stock total**) de la semana → se dispara la atribución.
6. Encargado/Analista: ver **reportes** y **heatmap**.

## Flujo de datos semanal

```
Operario escanea muebles (app, offline) ──sync──▶ scan_sessions / scan_lines
Admin importa ventas (web) ──▶ sales ──attribute_sales()──▶ sales_attribution
                                                   └──▶ weekly_fixture_metrics
Admin importa stock total ──▶ store_stock ──store_warehouse()──▶ almacén deducido
```
