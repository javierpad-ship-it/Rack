'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

// Exportar precios a SAP lo pueden hacer admin y analista (igual que la RLS/RPC).
async function ensureExporter(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' || profile?.role === 'analista' ? user.id : null;
}

export type ExportableRow = {
  id: number;
  generic_code: string;
  sales_org: string | null;
  proposed_pvp: number;
  decided_pvp: number | null;
  status: 'aceptada' | 'contrapropuesta';
};

// Aceptadas/contrapropuestas con precio decidido, aún no exportadas.
export async function listExportable(): Promise<ActionResult<ExportableRow[]>> {
  const uid = await ensureExporter();
  if (!uid) return { ok: false, error: 'Requiere rol admin o analista.' };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('price_proposals')
    .select('id, generic_code, sales_org, proposed_pvp, decided_pvp, status')
    .in('status', ['aceptada', 'contrapropuesta'])
    .is('exported_at', null)
    .order('generic_code');
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ExportableRow[] };
}

// Genera el lote: inserta en generic_prices (nuevo vigente por Org elegida),
// marca exported_at, y devuelve las filas para el xlsx.
export async function generateExport(
  proposalIds: number[],
  orgs: string[],
  validFrom: string,
): Promise<ActionResult<{ exportId: number }>> {
  const uid = await ensureExporter();
  if (!uid) return { ok: false, error: 'Requiere rol admin o analista.' };
  const useOrgs = orgs.filter((o) => o === 'R050' || o === 'R040');
  if (!useOrgs.length) return { ok: false, error: 'Elige al menos una Org. de Ventas.' };
  if (!proposalIds.length) return { ok: false, error: 'Selecciona al menos una propuesta.' };

  const admin = createAdminClient();
  const { data: props, error: pErr } = await admin
    .from('price_proposals')
    .select('id, generic_code, proposed_pvp, decided_pvp, status')
    .in('id', proposalIds)
    .in('status', ['aceptada', 'contrapropuesta'])
    .is('exported_at', null);
  if (pErr) return { ok: false, error: pErr.message };
  if (!props?.length) return { ok: false, error: 'Nada por exportar (¿ya se exportó?).' };

  const { data: exp, error: eErr } = await admin
    .from('price_change_exports')
    .insert({ orgs: useOrgs, valid_from: validFrom, generated_by: uid })
    .select('id')
    .single();
  if (eErr) return { ok: false, error: eErr.message };

  const items = [];
  const prices = [];
  for (const p of props) {
    const pvp = p.decided_pvp ?? p.proposed_pvp;
    for (const org of useOrgs) {
      items.push({ export_id: exp.id, proposal_id: p.id, generic_code: p.generic_code, sales_org: org, pvp });
      prices.push({ generic_code: p.generic_code, sales_org: org, pvp, valid_from: validFrom, source: 'proposal' });
    }
  }
  const { error: iErr } = await admin.from('price_change_export_items').insert(items);
  if (iErr) return { ok: false, error: iErr.message };
  const { error: gpErr } = await admin
    .from('generic_prices')
    .upsert(prices, { onConflict: 'generic_code,sales_org,valid_from', ignoreDuplicates: true });
  if (gpErr) return { ok: false, error: gpErr.message };

  const { error: uErr } = await admin
    .from('price_proposals')
    .update({ exported_at: new Date().toISOString() })
    .in('id', props.map((p) => p.id));
  if (uErr) return { ok: false, error: uErr.message };

  return { ok: true, data: { exportId: exp.id } };
}
