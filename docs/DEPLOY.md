# Guía de despliegue

Stack: **Supabase** (DB + Auth + Storage) · **Vercel** (web) · **APK** (app Android).
Objetivo: simple y económico para 10-50 tiendas.

## 1. Supabase (backend)

1. Crear un proyecto en https://supabase.com (región más cercana).
2. Aplicar las migraciones (en orden) desde el SQL Editor o la CLI:
   - `supabase/migrations/0001_init.sql`
   - `supabase/migrations/0002_attribution.sql`
   - `supabase/migrations/0003_storage.sql`
   Con la CLI:
   ```bash
   supabase link --project-ref <ref>
   supabase db push          # aplica las migraciones del repo
   ```
3. Crear el **usuario administrador inicial**: Authentication > Users > Add user.
   Luego en el SQL Editor, asignarle el rol:
   ```sql
   update profiles set role = 'admin' where id = '<uuid-del-usuario>';
   ```
4. Anotar de Project Settings > API: `Project URL`, `anon key` y `service_role key`.

> El test de la lógica se corre con: `psql "$DATABASE_URL" -f supabase/tests/attribution_test.sql`.

## 2. Web (Vercel)

1. Importar el repo en Vercel y setear **Root Directory = `web`**.
2. Variables de entorno (Project Settings > Environment Variables):
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY` (solo server-side; nunca exponer)
3. Deploy. Build command `next build` (autodetectado).

Local:
```bash
cd web && npm install && cp .env.local.example .env.local && npm run dev
```

## 3. App Android (APK)

1. En `mobile/local.properties` agregar:
   ```
   SUPABASE_URL=https://<ref>.supabase.co
   SUPABASE_ANON_KEY=<anon-key>
   ```
2. Generar el wrapper una vez (entorno con Gradle):
   ```bash
   cd mobile && gradle wrapper --gradle-version 8.7
   ```
3. Compilar:
   ```bash
   ./gradlew assembleDebug      # APK en app/build/outputs/apk/debug/
   ```
4. Instalar en el equipo Honeywell (`adb install` o MDM).
5. **Scanner Honeywell:** en el equipo, Settings > Scanning, perfil de la app: activar salida por
   **Intent** apuntando a la acción de `HoneywellScannerProvider`. Sin esto, usar el campo de captura (wedge).

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
