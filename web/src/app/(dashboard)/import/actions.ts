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

// Pares (tienda, fecha) que ya tienen datos cargados (para avisar antes de
// reemplazar un día ya subido). El reparto por tienda ya viene resuelto
// (ver store-aliases/actions.ts resolveStoreLabels).
export async function existingSalesDates(
  pairs: { storeId: string; date: string }[],
): Promise<{ storeId: string; date: string }[]> {
  await assertAdmin();
  if (pairs.length === 0) return [];
  const admin = createAdminClient();
  const storeIds = [...new Set(pairs.map((p) => p.storeId))];
  const dates = [...new Set(pairs.map((p) => p.date))];
  const { data, error } = await admin
    .from('sales_daily')
    .select('store_id, sale_date')
    .in('store_id', storeIds)
    .in('sale_date', dates);
  if (error) throw new Error(error.message);
  const existing = new Set((data ?? []).map((d) => `${d.store_id}|${d.sale_date}`));
  const seen = new Set<string>();
  return pairs.filter((p) => {
    const key = `${p.storeId}|${p.date}`;
    if (!existing.has(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// rawRows ya vienen con `storeId` resuelto por fila (una tienda por fila,
// varias tiendas por archivo). Se agrupa y procesa una vez por tienda.
export async function importSalesDaily(rawRows: (SalesDailyRow & { storeId: string })[]) {
  const uid = await assertAdmin();
  if (rawRows.length === 0) return { ok: 0 };
  const admin = createAdminClient();

  const { data: aliasData } = await admin.from('product_aliases').select('alias, sku');
  const aliasMap = new Map((aliasData ?? []).map((a) => [a.alias as string, a.sku as string]));

  const byStore = new Map<string, (SalesDailyRow & { storeId: string })[]>();
  for (const r of rawRows) {
    if (!byStore.has(r.storeId)) byStore.set(r.storeId, []);
    byStore.get(r.storeId)!.push(r);
  }

  let totalOk = 0;
  for (const [storeId, storeRows] of byStore) {
    // Agrega duplicados que colapsan al mismo (sku, fecha) sumando cantidades.
    const agg = new Map<string, Omit<SalesDailyRow, 'store_label'>>();
    let from = '9999-12-31';
    let to = '0000-01-01';
    for (const r of storeRows) {
      const sku = aliasMap.get(r.sku) ?? r.sku;
      const key = `${r.sale_date}|${sku}`;
      const prev = agg.get(key);
      if (prev) {
        prev.units += r.units;
        prev.amount += r.amount;
        prev.margin += r.margin;
      } else {
        // Se excluye storeId/store_label: no son columnas de sales_daily.
        const { storeId: _sid, store_label, ...rest } = r;
        agg.set(key, { ...rest, sku });
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

    const { error } = await admin.rpc('recompute_sales_range', {
      p_store_id: storeId,
      p_from: from,
      p_to: to,
    });
    if (error) throw new Error(`recompute: ${error.message}`);

    await logImport({ kind: 'sales_daily', storeId, week: null, rowsOk: rows.length, rowsError: 0, createdBy: uid });
    totalOk += rows.length;
  }
  return { ok: totalOk };
}

// rawRows ya vienen con `storeId` resuelto por fila (una tienda por fila,
// varias tiendas por archivo). Se agrupa y procesa una vez por tienda.
export async function importStockSnapshot(rawRows: (StockSnapshotRow & { storeId: string })[]) {
  const uid = await assertAdmin();
  if (rawRows.length === 0) return { ok: 0 };
  const admin = createAdminClient();

  const byStore = new Map<string, (StockSnapshotRow & { storeId: string })[]>();
  for (const r of rawRows) {
    if (!byStore.has(r.storeId)) byStore.set(r.storeId, []);
    byStore.get(r.storeId)!.push(r);
  }

  let totalOk = 0;
  const now = new Date().toISOString();
  // Catálogo: se deriva una sola vez de TODAS las filas (es store-agnostic).
  const catalogMap = new Map<string, Omit<StockSnapshotRow, 'store_label'>>();

  for (const [storeId, storeRows] of byStore) {
    // Dedup por variante (último gana) para respetar la PK (store_id, sku).
    const map = new Map<string, Omit<StockSnapshotRow, 'store_label'>>();
    for (const r of storeRows) {
      const { storeId: _sid, store_label, ...rest } = r;
      map.set(rest.sku, rest);
      catalogMap.set(rest.sku, rest);
    }
    const rows = [...map.values()];

    // Reemplazar la foto: borrar el stock vigente de esa tienda e insertar el nuevo.
    const { error: delErr } = await admin.from('stock_current').delete().eq('store_id', storeId);
    if (delErr) throw new Error(`stock_current: ${delErr.message}`);
    await upsertChunked(
      'stock_current',
      rows.map((r) => ({ store_id: storeId, updated_at: now, ...r })),
      'store_id,sku',
    );

    // Refrescar el almacén deducido de la semana vigente con las nuevas unidades.
    const { error } = await admin.rpc('apply_stock_snapshot', { p_store_id: storeId });
    if (error) throw new Error(`apply_stock_snapshot: ${error.message}`);

    await logImport({ kind: 'stock_snapshot', storeId, week: null, rowsOk: rows.length, rowsError: 0, createdBy: uid });
    totalOk += rows.length;
  }

  // Derivar/actualizar el catálogo (products) desde el stock vigente: no hay
  // carga manual de catálogo, el nombre/familia/categoría de cada SKU sale de
  // la última foto de stock que lo mencione (en cualquier tienda).
  const products = [...catalogMap.values()].map((r) => {
    const variant = [r.color, r.talla].filter(Boolean).join(' ');
    const name = r.description
      ? variant
        ? `${r.description} (${variant})`
        : r.description
      : r.sku;
    // No se manda `ean`: así no se pisa un valor ya cargado (el stock vigente
    // no trae EAN). PostgREST solo actualiza las columnas presentes en el body.
    return {
      sku: r.sku,
      name,
      family: r.group_name,
      category: r.sap_line,
      updated_at: now,
    };
  });
  await upsertChunked('products', products, 'sku');

  return { ok: totalOk };
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
