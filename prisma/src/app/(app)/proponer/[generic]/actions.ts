'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSelectedStoreId } from '@/lib/store';

export type ProposeResult = { ok: true } | { ok: false; error: string };

export async function createProposal(input: {
  generic_code: string;
  sku: string | null;
  current_pvp: number | null;
  proposed_pvp: number;
  reason: string;
}): Promise<ProposeResult> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: 'Sesión expirada.' };
  if (!(input.proposed_pvp > 0)) return { ok: false, error: 'Ingresa un PVP válido.' };

  const storeId = getSelectedStoreId();
  const { data: store } = await supabase.from('stores').select('sales_org').eq('id', storeId).single();

  // Responsable de línea (resp) del genérico, de la última foto de stock.
  const { data: snap } = await supabase
    .from('stock_snapshots')
    .select('resp, snapshot_date')
    .eq('generic_code', input.generic_code)
    .order('snapshot_date', { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from('price_proposals').insert({
    generic_code: input.generic_code,
    sku: input.sku,
    store_id: storeId,
    sales_org: store?.sales_org ?? null,
    requested_by: user.id,
    reason: input.reason || null,
    resp: snap?.resp ?? null,
    current_pvp: input.current_pvp,
    proposed_pvp: input.proposed_pvp,
  });
  if (error) return { ok: false, error: 'No se pudo enviar la propuesta.' };
  redirect('/propuestas?ok=1');
}
