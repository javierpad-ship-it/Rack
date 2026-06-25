import * as XLSX from 'xlsx';

// Normaliza encabezados: minúsculas, sin acentos, sin espacios extra.
function normHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
}

export interface ParseResult<T> {
  rows: T[];
  errors: { row: number; message: string }[];
}

function readSheet(file: ArrayBuffer): Record<string, unknown>[] {
  const wb = XLSX.read(file, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
  // Re-mapear claves a encabezados normalizados.
  return raw.map((r) => {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(r)) out[normHeader(k)] = r[k];
    return out;
  });
}

function pick(row: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) if (row[k] != null && row[k] !== '') return row[k];
  return null;
}

export interface CatalogRow {
  sku: string;
  ean: string | null;
  name: string;
  family: string | null;
  category: string | null;
}

// Catálogo: columnas sku, ean, nombre/descripcion, familia, categoria.
export function parseCatalog(file: ArrayBuffer): ParseResult<CatalogRow> {
  const rows: CatalogRow[] = [];
  const errors: ParseResult<CatalogRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const sku = pick(r, ['sku', 'codigo', 'cod', 'articulo']);
    const name = pick(r, ['nombre', 'descripcion', 'name', 'detalle']);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Falta SKU' });
      return;
    }
    rows.push({
      sku: String(sku).trim(),
      ean: pick(r, ['ean', 'codigo barra', 'codigo de barra', 'barcode']) as string | null,
      name: name ? String(name).trim() : String(sku),
      family: pick(r, ['familia', 'linea', 'family']) as string | null,
      category: pick(r, ['categoria', 'rubro', 'category']) as string | null,
    });
  });
  return { rows, errors };
}

export interface SalesRow {
  sku: string;
  units: number;
  amount: number;
}

// Ventas: columnas sku, unidades/cantidad, importe/monto. La semana se elige aparte.
export function parseSales(file: ArrayBuffer): ParseResult<SalesRow> {
  const rows: SalesRow[] = [];
  const errors: ParseResult<SalesRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const sku = pick(r, ['sku', 'codigo', 'cod', 'articulo']);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Falta SKU' });
      return;
    }
    rows.push({
      sku: String(sku).trim(),
      units: Number(pick(r, ['unidades', 'cantidad', 'units', 'qty']) ?? 0) || 0,
      amount: Number(pick(r, ['importe', 'monto', 'amount', 'total', 'venta']) ?? 0) || 0,
    });
  });
  return { rows, errors };
}

export interface StockRow {
  sku: string;
  total_units: number;
}

// Stock total por tienda: columnas sku, stock/total/existencia.
export function parseStock(file: ArrayBuffer): ParseResult<StockRow> {
  const rows: StockRow[] = [];
  const errors: ParseResult<StockRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const sku = pick(r, ['sku', 'codigo', 'cod', 'articulo']);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Falta SKU' });
      return;
    }
    rows.push({
      sku: String(sku).trim(),
      total_units: Number(pick(r, ['stock', 'total', 'existencia', 'unidades', 'total_units']) ?? 0) || 0,
    });
  });
  return { rows, errors };
}
