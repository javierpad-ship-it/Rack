'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { GenericPriceRow } from '@/lib/import/parseExcel';

export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string };

async function ensureAdmin(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user.id : null;
}

// Fecha placeholder para el precio vigente cuando el archivo no trae fecha de cambio.
const DEFAULT_FROM = '2020-01-01';
// Fecha (muy anterior) para el PVP anterior, garantizando que ordene antes del vigente.
const PREV_FROM = '2000-01-01';

const CHUNK = 500;

// Importa precios por (genérico, Org). Siembra el vigente y, si existe, el anterior.
export async function importGenericPrices(
  rows: GenericPriceRow[],
  orgs: string[],
): Promise<ActionResult<{ generics: number; priceRows: number }>> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const useOrgs = (orgs?.length ? orgs : ['R050', 'R040']).filter((o) => o === 'R050' || o === 'R040');
  if (!useOrgs.length) return { ok: false, error: 'Elige al menos una Org. de Ventas.' };

  type PriceInsert = { generic_code: string; sales_org: string; pvp: number; valid_from: string; source: string };
  const out: PriceInsert[] = [];
  for (const r of rows) {
    if (!(r.pvp > 0)) continue;
    for (const org of useOrgs) {
      out.push({ generic_code: r.generic_code, sales_org: org, pvp: r.pvp, valid_from: r.fecha_cambio ?? DEFAULT_FROM, source: 'pvp_rackone' });
      if (r.pvp_anterior != null && r.pvp_anterior > 0 && r.pvp_anterior !== r.pvp) {
        out.push({ generic_code: r.generic_code, sales_org: org, pvp: r.pvp_anterior, valid_from: PREV_FROM, source: 'pvp_rackone' });
      }
    }
  }

  const admin = createAdminClient();
  for (let i = 0; i < out.length; i += CHUNK) {
    const slice = out.slice(i, i + CHUNK);
    const { error } = await admin.from('generic_prices').upsert(slice, { onConflict: 'generic_code,sales_org,valid_from', ignoreDuplicates: true });
    if (error) return { ok: false, error: `generic_prices: ${error.message}` };
  }
  return { ok: true, data: { generics: rows.length, priceRows: out.length } };
}
