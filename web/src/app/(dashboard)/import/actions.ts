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

// ---- Carga por lotes (para archivos grandes) --------------------------------
// El navegador agrega/deduplica y llama estas acciones en tandas chicas, para
// no exceder el límite de tamaño de los Server Actions. El recálculo va aparte,
// una sola vez al final.

type SalesDailyInsert = Omit<SalesDailyRow, 'store_label'> & { store_id: string };

// Inserta un lote de ventas diarias (ya agregadas por store/sku/fecha). No recomputa.
export async function appendSalesDaily(rows: SalesDailyInsert[]) {
  await assertAdmin();
  if (rows.length === 0) return { ok: 0 };
  await upsertChunked('sales_daily', rows, 'store_id,sku,sale_date');
  return { ok: rows.length };
}

// Recalcula semanas comerciales + atribución para cada (tienda, rango de fechas).
export async function recomputeSalesDaily(
  ranges: { storeId: string; from: string; to: string; rows: number }[],
) {
  const uid = await assertAdmin();
  const admin = createAdminClient();
  for (const r of ranges) {
    const { error } = await admin.rpc('recompute_sales_range', {
      p_store_id: r.storeId,
      p_from: r.from,
      p_to: r.to,
    });
    if (error) throw new Error(`recompute: ${error.message}`);
    await logImport({ kind: 'sales_daily', storeId: r.storeId, week: null, rowsOk: r.rows, rowsError: 0, createdBy: uid });
  }
}

type StockInsert = Omit<StockSnapshotRow, 'store_label'>;

// Prepara la carga de una foto: borra esa (tienda, fecha) y el stock vigente.
export async function beginStockSnapshot(storeId: string, snapshotDate: string) {
  await assertAdmin();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error('Fecha de la foto inválida (YYYY-MM-DD).');
  const admin = createAdminClient();
  const { error: e1 } = await admin.from('stock_snapshots').delete().eq('store_id', storeId).eq('snapshot_date', snapshotDate);
  if (e1) throw new Error(`stock_snapshots: ${e1.message}`);
  const { error: e2 } = await admin.from('stock_current').delete().eq('store_id', storeId);
  if (e2) throw new Error(`stock_current: ${e2.message}`);
}

// Inserta un lote de stock (snapshot por fecha + stock vigente + catálogo).
export async function appendStockSnapshot(storeId: string, snapshotDate: string, rows: StockInsert[]) {
  await assertAdmin();
  if (rows.length === 0) return { ok: 0 };
  const now = new Date().toISOString();
  await upsertChunked(
    'stock_snapshots',
    rows.map((r) => ({ store_id: storeId, snapshot_date: snapshotDate, updated_at: now, ...r })),
    'store_id,sku,snapshot_date',
  );
  await upsertChunked(
    'stock_current',
    rows.map(({ classification, ...r }) => ({ store_id: storeId, updated_at: now, ...r })),
    'store_id,sku',
  );
  // Catálogo derivado del stock (sku, nombre, familia/categoría).
  const products = rows.map((r) => {
    const variant = [r.color, r.talla].filter(Boolean).join(' ');
    const name = r.description ? (variant ? `${r.description} (${variant})` : r.description) : r.sku;
    return { sku: r.sku, name, family: r.group_name, category: r.sap_line, updated_at: now };
  });
  await upsertChunked('products', products, 'sku');
  return { ok: rows.length };
}

// Cierra la carga de la foto: refresca el almacén de la semana de esa fecha.
export async function finalizeStockSnapshot(storeId: string, snapshotDate: string, rows: number) {
  const uid = await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.rpc('apply_stock_snapshot', { p_store_id: storeId, p_date: snapshotDate });
  if (error) throw new Error(`apply_stock_snapshot: ${error.message}`);
  await logImport({ kind: 'stock_snapshot', storeId, week: null, rowsOk: rows, rowsError: 0, createdBy: uid });
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
// varias tiendas por archivo). `snapshotDate` (YYYY-MM-DD) es la fecha de la
// foto de stock, elegida en la UI: se guarda por fecha para conservar el cierre
// de mes. La foto también actualiza el stock vigente (stock_current).
export async function importStockSnapshot(
  rawRows: (StockSnapshotRow & { storeId: string })[],
  snapshotDate: string,
) {
  const uid = await assertAdmin();
  if (rawRows.length === 0) return { ok: 0 };
  if (!/^\d{4}-\d{2}-\d{2}$/.test(snapshotDate)) throw new Error('Fecha de la foto inválida (YYYY-MM-DD).');
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
    // Dedup por variante (último gana) para respetar la PK (store_id, sku, fecha).
    const map = new Map<string, Omit<StockSnapshotRow, 'store_label'>>();
    for (const r of storeRows) {
      const { storeId: _sid, store_label, ...rest } = r;
      map.set(rest.sku, rest);
      catalogMap.set(rest.sku, rest);
    }
    const rows = [...map.values()];

    // Guardar la foto con su fecha: reemplaza SOLO esa (tienda, fecha).
    const { error: delSnapErr } = await admin
      .from('stock_snapshots')
      .delete()
      .eq('store_id', storeId)
      .eq('snapshot_date', snapshotDate);
    if (delSnapErr) throw new Error(`stock_snapshots: ${delSnapErr.message}`);
    await upsertChunked(
      'stock_snapshots',
      rows.map((r) => ({ store_id: storeId, snapshot_date: snapshotDate, updated_at: now, ...r })),
      'store_id,sku,snapshot_date',
    );

    // Foto vigente (stock_current) = la que se acaba de cargar. stock_current no
    // tiene columna classification, así que se excluye.
    const { error: delErr } = await admin.from('stock_current').delete().eq('store_id', storeId);
    if (delErr) throw new Error(`stock_current: ${delErr.message}`);
    await upsertChunked(
      'stock_current',
      rows.map(({ classification, ...r }) => ({ store_id: storeId, updated_at: now, ...r })),
      'store_id,sku',
    );

    // Refrescar el almacén deducido de la semana comercial de la fecha de la foto.
    const { error } = await admin.rpc('apply_stock_snapshot', {
      p_store_id: storeId,
      p_date: snapshotDate,
    });
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
