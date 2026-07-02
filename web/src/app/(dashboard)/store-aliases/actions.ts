'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'No autenticado.';
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return 'Requiere rol admin.';
  return null;
}

// Normaliza para que la búsqueda no dependa de mayúsculas/espacios exactos.
function normalizeStoreLabel(s: string): string {
  return s.trim().toUpperCase().replace(/\s+/g, ' ');
}

export interface StoreAliasRow {
  alias: string;
  store_id: string;
  store_name: string;
}

export async function listStoreAliases(): Promise<ActionResult<StoreAliasRow[]>> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('store_aliases')
    .select('alias, store_id, stores(name)')
    .order('alias');
  if (error) return { ok: false, error: error.message };
  const rows: StoreAliasRow[] = (data ?? []).map((r: any) => ({
    alias: r.alias,
    store_id: r.store_id,
    store_name: r.stores?.name ?? '(tienda eliminada)',
  }));
  return { ok: true, data: rows };
}

export async function upsertStoreAlias(alias: string, storeId: string): Promise<ActionResult> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  const norm = normalizeStoreLabel(alias);
  if (!norm) return { ok: false, error: 'El nombre no puede estar vacío.' };
  const admin = createAdminClient();
  const { error } = await admin
    .from('store_aliases')
    .upsert({ alias: norm, store_id: storeId }, { onConflict: 'alias' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteStoreAlias(alias: string): Promise<ActionResult> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  const admin = createAdminClient();
  const { error } = await admin.from('store_aliases').delete().eq('alias', alias);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

// Resuelve etiquetas (tal como vienen del archivo) a store_id. Devuelve un
// mapa `label original -> store_id | null` (null = sin mapeo todavía).
export async function resolveStoreLabels(labels: string[]): Promise<ActionResult<Record<string, string | null>>> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  const admin = createAdminClient();
  const { data, error } = await admin.from('store_aliases').select('alias, store_id');
  if (error) return { ok: false, error: error.message };
  const map = new Map<string, string>((data ?? []).map((a) => [a.alias as string, a.store_id as string]));
  const result: Record<string, string | null> = {};
  for (const label of new Set(labels)) {
    result[label] = map.get(normalizeStoreLabel(label)) ?? null;
  }
  return { ok: true, data: result };
}
