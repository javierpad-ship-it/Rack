'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CatalogRow, SalesRow, StockRow, SalesDailyRow, StockSnapshotRow } from '@/lib/import/parseExcel';

// Verifica que el usuario actual sea admin antes de operaciones masivas.
async function assertAdmin() {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('No autenticado');
  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (profile?.role !== 'admin') throw new Error('Requiere rol admin');
  return user.id;
}

const CHUNK = 500;
async function upsertChunked<T>(
  table: string,
  rows: T[],
  onConflict: string,
): Promise<void> {
  const admin = createAdminClient();
  for (let i = 0; i < rows.length; i += CHUNK) {
    const slice = rows.slice(i, i + CHUNK);
    const { error } = await admin.from(table).upsert(slice as object[], { onConflict });
    if (error) throw new Error(`${table}: ${error.message}`);
  }
}

async function logImport(args: {
  kind: string;
  storeId: string | null;
  week: string | null;
  rowsOk: number;
  rowsError: number;
  createdBy: string;
}) {
  const admin = createAdminClient();
  await admin.from('import_logs').insert({
    kind: args.kind,
    store_id: args.storeId,
    week: args.week,
    rows_ok: args.rowsOk,
    rows_error: args.rowsError,
    created_by: args.createdBy,
  });
}

export async function importCatalog(rows: CatalogRow[]) {
  const uid = await assertAdmin();
  await upsertChunked(
    'products',
    rows.map((r) => ({ ...r, updated_at: new Date().toISOString() })),
    'sku',
  );
  await logImport({ kind: 'catalog', storeId: null, week: null, rowsOk: rows.length, rowsError: 0, createdBy: uid });
  return { ok: rows.length };
}

// Resuelve códigos del POS a SKU canónico (Fase 2) y agrega duplicados que colapsan
// al mismo SKU sumando unidades e importe.
async function resolveAndAggregate(rows: SalesRow[]): Promise<SalesRow[]> {
  const admin = createAdminClient();
  const { data } = await admin.from('product_aliases').select('alias, sku');
  const aliasMap = new Map((data ?? []).map((a) => [a.alias as string, a.sku as string]));
  const agg = new Map<string, SalesRow>();
  for (const r of rows) {
    const sku = aliasMap.get(r.sku) ?? r.sku;
    const prev = agg.get(sku);
    if (prev) {
      prev.units += r.units;
      prev.amount += r.amount;
    } else {
      agg.set(sku, { sku, units: r.units, amount: r.amount });
    }
  }
  return [...agg.values()];
}

export async function importSales(storeId: string, week: string, rawRows: SalesRow[]) {
  const uid = await assertAdmin();
  const rows = await resolveAndAggregate(rawRows);
  await upsertChunked(
    'sales',
    rows.map((r) => ({ store_id: storeId, week, ...r })),
    'store_id,sku,week',
  );
  // Disparar atribución por SKU (regla "primer mueble") para esa tienda/semana.
  const admin = createAdminClient();
  const { error } = await admin.rpc('attribute_sales', { p_store_id: storeId, p_week: week });
  if (error) throw new Error(`attribute_sales: ${error.message}`);
  await logImport({ kind: 'sales', storeId, week, rowsOk: rows.length, rowsError: 0, createdBy: uid });
  return { ok: rows.length };
}

export async function importSalesDaily(storeId: string, rawRows: SalesDailyRow[]) {
  const uid = await assertAdmin();
  if (rawRows.length === 0) return { ok: 0 };
  const admin = createAdminClient();

  // Resolver alias de SKU (Fase 2) y agregar por (sku, fecha).
  const { data: aliasData } = await admin.from('product_aliases').select('alias, sku');
  const aliasMap = new Map((aliasData ?? []).map((a) => [a.alias as string, a.sku as string]));

  const agg = new Map<string, SalesDailyRow>();
  let from = '9999-12-31';
  let to = '0000-01-01';
  for (const r of rawRows) {
    const sku = aliasMap.get(r.sku) ?? r.sku;
    const key = `${r.sale_date}|${sku}`;
    const prev = agg.get(key);
    if (prev) {
      prev.units += r.units;
      prev.amount += r.amount;
      prev.margin += r.margin;
    } else {
      agg.set(key, { ...r, sku });
    }
    if (r.sale_date < from) from = r.sale_date;
    if (r.sale_date > to) to = r.sale_date;
  }
  const rows = [...agg.values()];

  await upsertChunked(
    'sales_daily',
    rows.map((r) => ({ store_id: storeId, ...r })),
    'store_id,sku,sale_date',
  );

  // Recalcular el agregado semanal `sales` + atribución de las semanas afectadas.
  const { error } = await admin.rpc('recompute_sales_range', {
    p_store_id: storeId,
    p_from: from,
    p_to: to,
  });
  if (error) throw new Error(`recompute: ${error.message}`);

  await logImport({ kind: 'sales_daily', storeId, week: null, rowsOk: rows.length, rowsError: 0, createdBy: uid });
  return { ok: rows.length };
}

export async function importStockSnapshot(storeId: string, rawRows: StockSnapshotRow[]) {
  const uid = await assertAdmin();
  const admin = createAdminClient();

  // Dedup por variante (último gana) para respetar la PK (store_id, sku).
  const map = new Map<string, StockSnapshotRow>();
  for (const r of rawRows) map.set(r.sku, r);
  const rows = [...map.values()];

  // Reemplazar la foto: borrar el stock vigente de la tienda e insertar el nuevo.
  const { error: delErr } = await admin.from('stock_current').delete().eq('store_id', storeId);
  if (delErr) throw new Error(`stock_current: ${delErr.message}`);
  await upsertChunked(
    'stock_current',
    rows.map((r) => ({ store_id: storeId, updated_at: new Date().toISOString(), ...r })),
    'store_id,sku',
  );

  // Refrescar el almacén deducido de la semana vigente con las nuevas unidades.
  const { error } = await admin.rpc('apply_stock_snapshot', { p_store_id: storeId });
  if (error) throw new Error(`apply_stock_snapshot: ${error.message}`);

  await logImport({ kind: 'stock_snapshot', storeId, week: null, rowsOk: rows.length, rowsError: 0, createdBy: uid });
  return { ok: rows.length };
}

export async function importStock(storeId: string, week: string, rows: StockRow[]) {
  const uid = await assertAdmin();
  await upsertChunked(
    'store_stock',
    rows.map((r) => ({ store_id: storeId, week, ...r })),
    'store_id,sku,week',
  );
  await logImport({ kind: 'stock', storeId, week, rowsOk: rows.length, rowsError: 0, createdBy: uid });
  return { ok: rows.length };
}
