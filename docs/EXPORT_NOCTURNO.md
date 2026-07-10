# Export nocturno del piso de venta a SharePoint

Deja cada noche un **Excel (.xlsx, columnas de verdad)** con el detalle del piso
de venta de todas las tiendas en una carpeta de SharePoint. Vía **Power Automate**
(no requiere registrar apps en Azure).

## Piezas

- **Endpoint**: `web/src/app/api/export/floor/route.ts` → `GET /api/export/floor`.
  - Protegido por `EXPORT_TOKEN` (query param `?token=…`). Sin token válido → 401.
  - `?week=YYYY-Www` opcional (default: semana comercial en curso).
  - Consulta `floor_detail_all` con service-role y arma el `.xlsx` con SheetJS.
  - Columnas: Tienda (Rack One), Tienda (archivo), Mueble, SKU, Descripción,
    Talla, Color, Género, Responsable, Unidades en piso.
- **Función SQL**: `floor_detail_all(p_week)` — detalle de TODAS las tiendas, sin
  filtro de rol (no otorgada a `authenticated`). Migración `0043`/`0044`.

## Configuración (una vez)

1. **Railway → servicio web → Variables**: `EXPORT_TOKEN = <clave larga random>`.
2. URL de prueba (baja el Excel): `https://<dominio-railway>/api/export/floor?token=<EXPORT_TOKEN>`.

## Flujo Power Automate (23:00 Perú)

1. **Scheduled cloud flow** → *Recurrence*: Day, 1, hora 23:00, TZ
   `(UTC-05:00) Bogotá, Lima, Quito`.
2. **HTTP** → GET a la URL con el token.
3. **SharePoint → Create file**: Site, Folder, *File Name*
   `piso_de_venta_@{utcNow('yyyy-MM-dd')}.xlsx`, *File Content* = Body del HTTP.

Notas: nombre con fecha = un archivo por día (o `Update file` para sobrescribir
uno fijo). El endpoint no expone SharePoint ni credenciales de M365; solo el
token. Ver gotcha #7 (service-role) en `LECCIONES_Y_GOTCHAS.md`.
