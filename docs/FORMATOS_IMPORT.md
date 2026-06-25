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

## Ventas (por tienda y semana — la semana se elige en la UI al importar)
| Columna | Alternativas | Obligatorio |
|---------|--------------|-------------|
| sku | codigo, cod, articulo | **Sí** |
| unidades | cantidad, units, qty | No (default 0) |
| importe | monto, amount, total, venta | No (default 0) |

## Stock total (por tienda y semana — para deducir almacén)
| Columna | Alternativas | Obligatorio |
|---------|--------------|-------------|
| sku | codigo, cod, articulo | **Sí** |
| stock | total, existencia, unidades, total_units | No (default 0) |

Implementación: `web/src/lib/import/parseExcel.ts`.
