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
Un solo archivo puede traer **todas las tiendas juntas** (columna `TIENDA`): cada fila se reparte
sola según el **Mapeo de tiendas** (`/store-aliases`, admin) — asocia el nombre tal como viene del
POS/QlikView con la tienda de Rack One. Si una tienda no está mapeada, esas filas no se cargan y la
UI avisa cuáles faltan. Si el archivo no trae `TIENDA`, se usa la tienda elegida en la UI (modo
respaldo, un archivo = una tienda).

La **fecha** sale del archivo. El **SKU es `CODIGO_VARIANTE`** (el mismo que se cruza con el escaneo
de piso y con el stock). Reimportar el mismo día/variante/tienda **reemplaza** esa línea (con aviso
previo); el resto del histórico no se toca.

| Columna | Alternativas aceptadas | Obligatorio |
|---|---|---|
| TIENDA | tienda, store, nombre tienda | No* (*si falta, usa la tienda de la UI) |
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
tu reporte de stock (Stk Fin Act / Stk Val Act / Costo Prom). Igual que en Ventas diario, un solo
archivo puede traer **todas las tiendas juntas** (columna `TIENDA`) y se reparte por el Mapeo de
tiendas; cada tienda reemplaza solo su propio stock, no el de las demás.

| Columna | Alternativas aceptadas | Obligatorio |
|---|---|---|
| TIENDA | tienda, store, nombre tienda | No* (*si falta, usa la tienda de la UI) |
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
