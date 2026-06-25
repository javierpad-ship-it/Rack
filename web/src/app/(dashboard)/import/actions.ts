'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { CatalogRow, SalesRow, StockRow } from '@/lib/import/parseExcel';

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

export async function importSales(storeId: string, week: string, rows: SalesRow[]) {
  const uid = await assertAdmin();
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
