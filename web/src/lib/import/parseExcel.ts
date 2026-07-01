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

// --- Ventas diarias (feed del POS: variante + fecha + cantidad/venta/margen) ---

const ES_MONTHS: Record<string, number> = {
  ene: 1, enero: 1, feb: 2, febrero: 2, mar: 3, marzo: 3, abr: 4, abril: 4,
  may: 5, mayo: 5, jun: 6, junio: 6, jul: 7, julio: 7, ago: 8, agosto: 8,
  sep: 9, set: 9, septiembre: 9, setiembre: 9, oct: 10, octubre: 10,
  nov: 11, noviembre: 11, dic: 12, diciembre: 12,
};

// Construye YYYY-MM-DD a partir de "MES_AÑO" (ej. "Jun 2026") + DIA (ej. 14).
function buildDate(mesAno: unknown, dia: unknown): string | null {
  const day = Number(dia);
  if (!day || day < 1 || day > 31) return null;
  const s = String(mesAno ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const yearM = s.match(/\d{4}/);
  if (!yearM) return null;
  const year = Number(yearM[0]);
  let month = 0;
  for (const key of Object.keys(ES_MONTHS)) {
    if (new RegExp(`(^|[^a-z])${key}([^a-z]|$)`).test(s)) { month = ES_MONTHS[key]; break; }
  }
  if (!month) {
    const mm = s.match(/(?:^|[^\d])(\d{1,2})[/\-]\d{4}/); // "06/2026"
    if (mm) month = Number(mm[1]);
  }
  if (!month || month < 1 || month > 12) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function num(v: unknown): number {
  if (v == null || v === '') return 0;
  const s = String(v).replace(/\s/g, '').replace(/%/g, '');
  const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? 0 : n;
}

export interface SalesDailyRow {
  sale_date: string;
  sku: string;
  article_code: string | null;
  description: string | null;
  group_name: string | null;
  sap_line: string | null;
  gender: string | null;
  units: number;
  amount: number;
  margin: number;
}

// Ventas diarias del POS. La tienda se elige en la UI; la fecha sale del archivo.
export function parseSalesDaily(file: ArrayBuffer): ParseResult<SalesDailyRow> {
  const rows: SalesDailyRow[] = [];
  const errors: ParseResult<SalesDailyRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const sku = pick(r, ['codigo_variante', 'codigo variante', 'variante', 'sku', 'codigo']);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Falta CODIGO_VARIANTE' });
      return;
    }
    const directDate = pick(r, ['fecha', 'date', 'dia_completo']);
    const sale_date = directDate
      ? String(directDate).slice(0, 10)
      : buildDate(pick(r, ['mes_ano', 'mes_año', 'mes', 'periodo']), pick(r, ['dia', 'day']));
    if (!sale_date || !/^\d{4}-\d{2}-\d{2}$/.test(sale_date)) {
      errors.push({ row: i + 2, message: 'Fecha inválida (MES_AÑO + DIA)' });
      return;
    }
    rows.push({
      sale_date,
      sku: String(sku).trim(),
      article_code: (pick(r, ['codigo_articulo', 'codigo articulo', 'articulo']) as string | null) ?? null,
      description: (pick(r, ['descripcion_articulo', 'descripcion articulo', 'descripcion', 'detalle']) as string | null) ?? null,
      group_name: (pick(r, ['grupo_producto', 'grupo producto', 'grupo']) as string | null) ?? null,
      sap_line: (pick(r, ['linea sap', 'linea_sap', 'linea']) as string | null) ?? null,
      gender: (pick(r, ['genero lukers', 'genero', 'sexo']) as string | null) ?? null,
      units: Math.round(num(pick(r, ['cant act', 'cantidad', 'unidades', 'cant', 'qty']))),
      amount: num(pick(r, ['venta act', 'venta', 'importe', 'monto', 'total'])),
      margin: num(pick(r, ['mg act', 'margen', 'mg', 'margin'])),
    });
  });
  return { rows, errors };
}

export interface StockSnapshotRow {
  sku: string;
  units: number;
  value: number;
  cost: number;
  article_code: string | null;
  description: string | null;
  group_name: string | null;
  sap_line: string | null;
  gender: string | null;
  color: string | null;
  talla: string | null;
  brand: string | null;
  arrival_year: string | null;
}

// Stock vigente del POS por variante (Stk Fin Act / Stk Val Act / Costo Prom).
export function parseStockSnapshot(file: ArrayBuffer): ParseResult<StockSnapshotRow> {
  const rows: StockSnapshotRow[] = [];
  const errors: ParseResult<StockSnapshotRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const sku = pick(r, ['codigo_variante', 'codigo variante', 'variante', 'sku', 'codigo']);
    if (!sku) {
      errors.push({ row: i + 2, message: 'Falta CODIGO_VARIANTE' });
      return;
    }
    rows.push({
      sku: String(sku).trim(),
      units: Math.round(num(pick(r, ['stk fin act', 'stock', 'existencia', 'unidades', 'total']))),
      value: num(pick(r, ['stk val act', 'valor', 'valorizado', 'stock valorizado'])),
      cost: num(pick(r, ['costo prom', 'costo promedio', 'costo', 'cost'])),
      article_code: (pick(r, ['codigo_articulo', 'codigo articulo', 'articulo']) as string | null) ?? null,
      description: (pick(r, ['descripcion_articulo', 'descripcion articulo', 'descripcion', 'detalle']) as string | null) ?? null,
      group_name: (pick(r, ['grupo_producto', 'grupo producto', 'grupo']) as string | null) ?? null,
      sap_line: (pick(r, ['linea sap', 'linea_sap', 'linea']) as string | null) ?? null,
      gender: (pick(r, ['genero lukers', 'genero', 'sexo']) as string | null) ?? null,
      color: (pick(r, ['color']) as string | null) ?? null,
      talla: (pick(r, ['talla', 'talle', 'size']) as string | null) ?? null,
      brand: (pick(r, ['marca', 'brand']) as string | null) ?? null,
      arrival_year: (pick(r, ['anio_llegada_lk', 'anio llegada', 'ano llegada', 'anio', 'ano']) as string | null)?.toString() ?? null,
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
