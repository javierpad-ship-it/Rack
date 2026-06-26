# Pendientes — Rack One

> Estado al 2026-06-26. Lista de trabajo pendiente, ordenada por prioridad.
> Marcá `[x]` a medida que se cierran.

## 🔴 Bloqueantes / operativos
- [ ] **Service-role key real en Railway.** Hoy `SUPABASE_SERVICE_ROLE_KEY` vale un valor
  inválido/corto. Sin esto no se pueden **crear usuarios** ni correr importaciones admin.
  Reemplazar por la secret/`service_role` real de Supabase (Settings → API Keys) + redeploy.
  Verificar en `/api/health` que el largo sea ≫ 22.
- [ ] **Verificar que todas las migraciones estén aplicadas en Supabase.** Solo se confirmó la
  `0011`. Cobertura, Reportes, Tendencias, Mensual, Alertas y Plano dependen de funciones de
  `0002`–`0010`. Confirmar que `0001`→`0011` corrieron.
- [ ] **Logo e ícono reales de Rack One.** Subir `rack-one-logo.png` y `rack-one-icon.png` a
  `web/public/brand/` y cablearlos en login, sidebar y favicon (hoy hay un glifo "1E" provisional).

## 🟠 Producto / web
- [ ] Crear primer dato real (tienda con pisos + muebles) y validar el flujo
  código → etiqueta → escaneo de punta a punta.
- [ ] Etiquetas: soporte para impresora de rollo (ej. 50×30 mm) y selección individual de
  muebles (checkboxes) además de "Todos".
- [ ] Decidir qué hacer con `/api/health` antes de producción (quitar o proteger).
- [ ] Editar tienda existente (nombre / nº de pisos); hoy solo se puede crear/eliminar.

## 🟣 Móvil (APK)
- [ ] Probar el APK en la EDA52 (instalación + gatillo + sync offline).
- [ ] Ícono de la app (usa el default de Android) y **firma release** (hoy es debug sin firmar).
- [ ] Mover credenciales del APK a *secrets* de GitHub (hoy embebidas en el workflow).

## 🟡 Backend / datos (Fase 2)
- [ ] Adaptador del POS/ERP real del cliente (hoy `ingest-sales` es plantilla genérica).
- [ ] Programar ingesta diaria con pg_cron al conectar el POS.
- [ ] Deducción automática de almacén e integración API POS (ventas/stock/catálogo);
  hoy es manual por Excel.

## 🟢 Decisiones a confirmar
- [ ] Formato real de los Excel del POS (columnas/nombres) — el parser asume alias por defecto.
- [ ] Definición de "semana" (ISO vs comercial) — afecta web, SQL y app.
- [ ] Regla de atribución de la proyección mensual (hoy "último mueble"; semanal es "primer mueble").
