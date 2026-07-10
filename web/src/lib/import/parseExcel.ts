import * as XLSX from 'xlsx';

// Normaliza encabezados: minúsculas, sin acentos, sin puntos, sin espacios extra.
// (Quita el punto para que "Costo Prom." matchee con "costo prom".)
function normHeader(h: string): string {
  return h
    .toString()
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\./g, '')
    .trim();
}

// Convierte un serial de fecha de Excel (días desde 1899-12-30) a YYYY-MM-DD.
function excelSerialToDate(serial: number): string | null {
  // Rango razonable (~1954 a ~2119) para no confundir con otros números.
  if (!(serial > 20000 && serial < 80000)) return null;
  const ms = Math.round((serial - 25569) * 86400 * 1000); // 25569 = 1970-01-01
  const d = new Date(ms);
  if (isNaN(d.getTime())) return null;
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

// Normaliza una fecha a YYYY-MM-DD. Acepta YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY,
// objetos Date y seriales de Excel. IMPORTANTE: el POS exporta DD/MM/AAAA; el
// libro se lee con raw:true (readSheet) para que las fechas lleguen como TEXTO
// y no como serial. Si aun así llega un número, se decodifica como serial de
// Excel (fecha absoluta, sin ambigüedad DD/MM).
function normalizeDate(v: unknown): string | null {
  if (v == null || v === '') return null;
  if (v instanceof Date && !isNaN(v.getTime())) {
    return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}-${String(v.getDate()).padStart(2, '0')}`;
  }
  if (typeof v === 'number') return excelSerialToDate(v);
  const s = String(v).trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); // YYYY-MM-DD
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[/\-](\d{1,2})[/\-](\d{4})/); // DD/MM/YYYY o DD-MM-YYYY
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  if (/^\d+(\.\d+)?$/.test(s)) return excelSerialToDate(Number(s)); // serial como texto
  return null;
}

export interface ParseResult<T> {
  rows: T[];
  errors: { row: number; message: string }[];
}

function readSheet(file: ArrayBuffer): Record<string, unknown>[] {
  // raw:true evita que xlsx "adivine" tipos. Sin esto, las fechas DD/MM con
  // día <= 12 (ej. 01/06/2026) se interpretan como MM/DD y se convierten a
  // serial numérico, que luego normalizeDate descartaba (se perdían días 1-12).
  const wb = XLSX.read(file, { type: 'array', raw: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null, raw: true });
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

// Normaliza un SKU/código de variante. El POS exporta el CODIGO_VARIANTE con
// ceros a la izquierda (padding, ej. 000001000000358024), mientras el stock lo
// trae sin ellos (1000000358024). Al leer en crudo (raw:true) ese padding se
// conservaba y ventas dejaba de cruzar con stock. Para códigos puramente
// numéricos se quitan los ceros a la izquierda, así ventas y stock coinciden
// siempre. Los códigos alfanuméricos se dejan intactos (solo trim).
export function normSku(v: unknown): string {
  const s = String(v).trim();
  if (/^\d+$/.test(s)) return s.replace(/^0+/, '') || '0';
  return s;
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
      sku: normSku(sku),
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
      sku: normSku(sku),
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

// Precio: como num() pero devuelve null cuando falta ('-', vacío, no numérico).
function priceOrNull(v: unknown): number | null {
  if (v == null) return null;
  const raw = String(v).trim();
  if (raw === '' || raw === '-') return null;
  const s = raw.replace(/\s/g, '').replace(/%/g, '');
  const n = Number(s.replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'));
  return isNaN(n) ? null : n;
}

export interface GenericPriceRow {
  generic_code: string;                 // CODIGO_GENERICO / Material, normalizado sin ceros
  empresa_label: string | null;         // EMPRESA (nombre o código SAP, tal como viene en el archivo)
  pvp: number;                          // PVP vigente / Precio Vta.Público
  pvp_anterior: number | null;          // PVP_ANTERIOR (null si 0 o igual al vigente)
  fecha_cambio: string | null;          // FECHA_CAMBIO_PVP / Inicio Validez (YYYY-MM-DD)
  classification: string | null;        // CLASIFICACION (VIGENTE/OBSOLETO)
}

// Archivo de PVP: EMPRESA, CODIGO_GENERICO, PVP, PVP_ANTERIOR, FECHA_CAMBIO_PVP.
// El PVP vive a nivel de (CODIGO_GENERICO, EMPRESA), así que deduplicamos por ese
// par (todas las variantes del mismo genérico comparten precio dentro de una
// empresa). Filas sin PVP se omiten.
export function parseGenericPrices(file: ArrayBuffer): ParseResult<GenericPriceRow> {
  const byKey = new Map<string, GenericPriceRow>();
  const errors: ParseResult<GenericPriceRow>['errors'] = [];
  readSheet(file).forEach((r, i) => {
    const gRaw = pick(r, ['codigo_generico', 'generico', 'material', 'material (generico)', 'codigo generico']);
    if (!gRaw) return; // fila sin genérico → ignorar
    const generic = normSku(gRaw);
    const empresaRaw = pick(r, ['empresa', 'company', 'razon social', 'razón social']);
    const empresa_label = empresaRaw != null ? String(empresaRaw).trim() : null;
    const pvp = priceOrNull(pick(r, ['pvp', 'precio vta publico', 'precio vtapublico', 'precio', 'pvp vigente']));
    if (pvp == null) return; // sin precio válido → omitir
    const ant = priceOrNull(pick(r, ['pvp_anterior', 'pvp anterior']));
    const fecha = normalizeDate(pick(r, ['fecha_cambio_pvp', 'fecha cambio pvp', 'fecha_cambio', 'inicio validez']));
    const clasif = pick(r, ['clasificacion', 'clasificación']);
    const pvp_anterior = ant != null && ant > 0 && ant !== pvp ? ant : null;
    const key = `${generic}|${empresa_label ?? ''}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        generic_code: generic,
        empresa_label,
        pvp,
        pvp_anterior,
        fecha_cambio: fecha,
        classification: clasif != null ? String(clasif) : null,
      });
    }
  });
  return { rows: [...byKey.values()], errors };
}

export interface SalesDailyRow {
  sale_date: string;
  sku: string;
  store_label: string | null; // columna TIENDA del archivo (reparto multi-tienda)
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
      ? normalizeDate(directDate)
      : buildDate(pick(r, ['mes_ano', 'mes_año', 'mes', 'periodo']), pick(r, ['dia', 'day']));
    if (!sale_date || !/^\d{4}-\d{2}-\d{2}$/.test(sale_date)) {
      errors.push({ row: i + 2, message: 'Fecha inválida (FECHA o MES_AÑO + DIA)' });
      return;
    }
    rows.push({
      sale_date,
      sku: normSku(sku),
      store_label: (pick(r, ['tienda', 'store', 'nombre tienda']) as string | null) ?? null,
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
  store_label: string | null; // columna TIENDA del archivo (reparto multi-tienda)
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
  classification: string | null;
  mundo: string | null;     // MUNDO_LK
  embarque: string | null;  // EXTRA1_LK (ej. "SIN EMBARQUE")
  resp: string | null;      // Resp. Lk (responsable, ej. "CARLA")
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
      sku: normSku(sku),
      store_label: (pick(r, ['tienda', 'store', 'nombre tienda']) as string | null) ?? null,
      units: Math.round(num(pick(r, ['stk fin act', 'stock', 'existencia', 'unidades', 'total']))),
      value: num(pick(r, ['stk val act', 'valor', 'valorizado', 'stock valorizado'])),
      cost: num(pick(r, ['costo prom', 'costo promedio', 'costo', 'cost'])),
      article_code: (pick(r, ['codigo_articulo', 'codigo articulo', 'articulo']) as string | null) ?? null,
      description: (pick(r, ['descripcion_articulo', 'descripcion articulo', 'descripcion', 'detalle']) as string | null) ?? null,
      group_name: (pick(r, ['grupo_producto', 'grupo producto', 'grupo']) as string | null) ?? null,
      sap_line: (pick(r, ['linea sap', 'linea_sap', 'linea']) as string | null) ?? null,
      gender: (pick(r, ['genero lukers', 'genero_lk', 'genero', 'sexo']) as string | null) ?? null,
      color: (pick(r, ['color']) as string | null) ?? null,
      talla: (pick(r, ['talla', 'talle', 'size']) as string | null) ?? null,
      brand: (pick(r, ['marca', 'brand', 'agrup_marca_lk']) as string | null) ?? null,
      arrival_year: (pick(r, ['anio_llegada_lk', 'anio llegada', 'ano llegada', 'anio', 'ano']) as string | null)?.toString() ?? null,
      classification: (pick(r, ['clasificacion', 'classification', 'estado']) as string | null) ?? null,
      mundo: (pick(r, ['mundo_lk', 'mundo']) as string | null) ?? null,
      embarque: (pick(r, ['extra1_lk', 'embarque']) as string | null) ?? null,
      resp: (pick(r, ['resp lk', 'resp_lk', 'responsable', 'resp']) as string | null) ?? null,
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
      sku: normSku(sku),
      total_units: Number(pick(r, ['stock', 'total', 'existencia', 'unidades', 'total_units']) ?? 0) || 0,
    });
  });
  return { rows, errors };
}
