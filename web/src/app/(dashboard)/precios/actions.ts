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

function normLabel(s: string): string {
  return s.trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
}

// Importa precios por (genérico, EMPRESA). Siembra el vigente y, si existe, el
// anterior. Filas cuya EMPRESA no matchea ninguna empresa dada de alta (por
// nombre, nombre_reporte o código SAP) se reportan como `unmatched` y no se
// cargan, para que el admin las revise en Mantenimiento → Empresas.
export async function importGenericPrices(
  rows: GenericPriceRow[],
): Promise<ActionResult<{ generics: number; priceRows: number; unmatched: string[] }>> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };

  const admin = createAdminClient();
  const { data: empresas, error: eErr } = await admin
    .from('empresas')
    .select('id, nombre, nombre_reporte, codigo_sap');
  if (eErr) return { ok: false, error: eErr.message };

  const map = new Map<string, string>(); // etiqueta normalizada -> empresa_id
  for (const e of empresas ?? []) {
    for (const label of [e.nombre, e.nombre_reporte, e.codigo_sap]) {
      if (label) map.set(normLabel(String(label)), e.id as string);
    }
  }

  type PriceInsert = { generic_code: string; empresa_id: string; pvp: number; valid_from: string; source: string };
  const out: PriceInsert[] = [];
  const unmatched = new Set<string>();
  for (const r of rows) {
    if (!(r.pvp > 0)) continue;
    const label = r.empresa_label?.trim();
    const empresaId = label ? map.get(normLabel(label)) : undefined;
    if (!empresaId) {
      if (label) unmatched.add(label);
      continue;
    }
    out.push({ generic_code: r.generic_code, empresa_id: empresaId, pvp: r.pvp, valid_from: r.fecha_cambio ?? DEFAULT_FROM, source: 'pvp_rackone' });
    if (r.pvp_anterior != null && r.pvp_anterior > 0 && r.pvp_anterior !== r.pvp) {
      out.push({ generic_code: r.generic_code, empresa_id: empresaId, pvp: r.pvp_anterior, valid_from: PREV_FROM, source: 'pvp_rackone' });
    }
  }

  for (let i = 0; i < out.length; i += CHUNK) {
    const slice = out.slice(i, i + CHUNK);
    const { error } = await admin.from('generic_prices').upsert(slice, { onConflict: 'generic_code,empresa_id,valid_from', ignoreDuplicates: true });
    if (error) return { ok: false, error: `generic_prices: ${error.message}` };
  }
  return { ok: true, data: { generics: rows.length, priceRows: out.length, unmatched: [...unmatched] } };
}
