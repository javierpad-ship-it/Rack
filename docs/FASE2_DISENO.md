# Fase 2 — Diseño: integración POS/ERP y analítica

Objetivo: reemplazar la carga manual de Excel por **ingesta automática** de catálogo, ventas y stock
desde el POS/ERP, y deducir el almacén automáticamente. Mantener compatibilidad con el import manual
(fallback).

## 1. Ingesta de datos

Patrón **adaptador**: una interfaz común y un adaptador por sistema origen. El núcleo no cambia
(las funciones `attribute_sales`, `store_warehouse`, etc. ya operan sobre `sales`/`store_stock`).

```
POS/ERP ──(adaptador)──▶ staging ──(normalización)──▶ sales / store_stock / products
```

Opciones de transporte (elegir según el POS):
- **API pull** (programado): un job lee la API del POS por tienda/semana. Recomendado si el POS expone REST.
- **Webhook push**: el POS notifica ventas; un endpoint las recibe.
- **SFTP/archivo**: drop de CSV en un bucket → trigger de procesamiento. Reusa el parser de Fase 1.

Implementación sugerida: **Supabase Edge Functions** (Deno) + **pg_cron** para el scheduling, o un
worker externo si el POS requiere VPN/credenciales especiales.

## 2. Modelo de datos (añadidos)

- `integrations` — por tienda: tipo de POS, credenciales (en Vault/secrets), estado, última corrida.
- `ingest_runs` — log de cada corrida (origen, rango, filas ok/error, duración) — extiende `import_logs`.
- `sales_staging` / `stock_staging` — datos crudos antes de normalizar (auditoría y reproceso).

## 3. Mapeo de SKU

El POS puede usar códigos distintos al catálogo. Agregar `product_aliases (alias, sku)` para resolver
EAN/códigos internos → SKU canónico antes de atribuir.

## 4. Almacén automático

Con `store_stock` alimentado por el POS, `store_warehouse()` ya deduce el almacén sin cambios.
Eliminar el paso manual y refrescar al cierre de cada corrida de stock.

## 5. Analítica avanzada (sobre lo ya construido)

- **Tendencias**: serie temporal de rotación por mueble/familia (vista materializada semanal).
- **Alertas**: producto con stock en almacén pero ausente del piso (oportunidad de reposición);
  muebles sin escanear en X semanas; caída de venta por mueble > umbral.
- **Ranking** de muebles por rotación y por venta, con filtros por familia/categoría.

## 6. Orden de implementación

1. `product_aliases` + resolución en `attribute_sales` (no rompe Fase 1).
2. Staging + 1 adaptador (el POS real del cliente) en modo pull programado.
3. Automatizar stock → almacén.
4. Vistas/alertas de analítica.

## Pendientes a confirmar (Fase 2)
- Sistema POS/ERP concreto y forma de acceso (API/credenciales/IP).
- Frecuencia de ingesta (diaria vs semanal) y zona horaria de corte.
- Reglas de alias de producto y manejo de SKUs desconocidos.
