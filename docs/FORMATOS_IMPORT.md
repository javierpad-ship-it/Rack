# Formatos de importación (Excel/CSV)

> **Default asumido** (revisable). El parser acepta varios nombres de columna alternativos y normaliza
> encabezados (minúsculas, sin acentos). La primera hoja del archivo es la que se lee.

## Catálogo de productos
| Columna | Alternativas aceptadas | Obligatorio |
|---------|------------------------|-------------|
| sku | codigo, cod, articulo | **Sí** |
| nombre | descripcion, name, detalle | No (default = sku) |
| ean | codigo barra, barcode | No |
| familia | linea, family | No |
| categoria | rubro, category | No |

## Ventas — diario (recomendado; carga incremental día a día, histórico 24 meses)
Se elige la **tienda** en la UI; la **fecha** sale del archivo. El **SKU es `CODIGO_VARIANTE`**
(el mismo que se cruza con el escaneo de piso y con el stock). Reimportar el mismo
día/variante **reemplaza** esa línea; el resto del histórico no se toca.

| Columna | Alternativas aceptadas | Obligatorio |
|---|---|---|
| CODIGO_VARIANTE | codigo_variante, variante, sku, codigo | **Sí** (es el SKU) |
| MES_AÑO + DIA | *(o una sola columna `fecha`)* | **Sí** — ej. `Jun 2026` + `14` → `2026-06-14` |
| CODIGO_ARTICULO | codigo_articulo, articulo | No |
| DESCRIPCION_ARTICULO | descripcion_articulo, descripcion, detalle | No |
| GRUPO_PRODUCTO | grupo_producto, grupo | No |
| LINEA SAP | linea_sap, linea | No |
| Género Lukers | genero, sexo | No |
| Cant Act | cantidad, unidades, cant, qty | No (default 0) |
| Venta Act | venta, importe, monto, total | No (default 0) |
| MG Act | margen, mg, margin | No (default 0) |

> Acepta miles/decimales tipo `1.234,56` o `1,234.56`. Al importar, se recalculan
> automáticamente la(s) semana(s) comercial(es) afectada(s) y la atribución por mueble.
> Implementación: `parseSalesDaily` / tabla `sales_daily` (`0013_sales_daily.sql`).

## Ventas — por semana (alternativa simple, sin detalle diario)
| Columna | Alternativas | Obligatorio |
|---------|--------------|-------------|
| sku | codigo, cod, articulo | **Sí** |
| unidades | cantidad, units, qty | No (default 0) |
| importe | monto, amount, total, venta | No (default 0) |

## Stock — foto vigente (recomendado; cada carga REEMPLAZA el stock anterior de la tienda)
SKU = `CODIGO_VARIANTE`. No lleva fecha: es la **foto de stock actual**, tal como la ves en
tu reporte de stock (Stk Fin Act / Stk Val Act / Costo Prom).

| Columna | Alternativas aceptadas | Obligatorio |
|---|---|---|
| CODIGO_VARIANTE | codigo_variante, variante, sku, codigo | **Sí** (es el SKU) |
| Stk Fin Act | stock, existencia, unidades, total | No (default 0) — unidades |
| Stk Val Act | valor, valorizado, stock valorizado | No (default 0) — valor $ |
| Costo Prom | costo promedio, costo, cost | No (default 0) |
| CODIGO_ARTICULO | codigo_articulo, articulo | No |
| DESCRIPCION_ARTICULO | descripcion_articulo, descripcion, detalle | No |
| GRUPO_PRODUCTO | grupo_producto, grupo | No |
| LINEA SAP | linea_sap, linea | No |
| Género Lukers | genero, sexo | No |
| COLOR | color | No |
| TALLA | talla, talle, size | No |
| MARCA | marca, brand | No |
| ANIO_LLEGADA_LK | anio_llegada, ano_llegada, anio, ano | No |

> Actualiza el almacén deducido de la semana vigente. Implementación: `parseStockSnapshot` /
> tabla `stock_current` (`0016_stock_current.sql`).

## Stock total — por semana (alternativa simple, sin reemplazo automático)
| Columna | Alternativas | Obligatorio |
|---------|--------------|-------------|
| sku | codigo, cod, articulo | **Sí** |
| stock | total, existencia, unidades, total_units | No (default 0) |

Implementación general: `web/src/lib/import/parseExcel.ts`.
