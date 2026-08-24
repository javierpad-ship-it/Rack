'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { getSelectedStoreId } from '@/lib/store';

export type ProposeResult = { ok: true } | { ok: false; error: string };

// Mismo umbral que la pantalla de proponer: con IRP de cadena > 20% la
// rotación ya es correcta y no se permite proponer un cambio de precio.
// Se revalida acá (no solo en la UI) por si alguien postea directo.
const IRP_ROTACION_CORRECTA = 20;

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
  const { data: rotData } = await supabase.rpc('generic_rotation', {
    p_generic: input.generic_code,
    p_store_id: storeId,
  });
  const rot = rotData as { cadena: number; tienda: number } | null;
  if (rot && rot.cadena > IRP_ROTACION_CORRECTA) {
    return { ok: false, error: `Rotación correcta en cadena (${rot.cadena}%) — no se permite proponer un cambio de precio.` };
  }
  const { data: store } = await supabase.from('stores').select('sales_org').eq('id', storeId).single();

  // Responsable de línea (resp) del genérico. stock_snapshots.generic_code no
  // se pobló nunca por import (mismo gotcha que 0051/0060): el genérico se
  // deriva del SKU, no vive en una columna. resp_of_generic() lo resuelve bien.
  const { data: resp } = await supabase.rpc('resp_of_generic', { p_generic: input.generic_code });

  const { error } = await supabase.from('price_proposals').insert({
    generic_code: input.generic_code,
    sku: input.sku,
    store_id: storeId,
    sales_org: store?.sales_org ?? null,
    requested_by: user.id,
    reason: input.reason || null,
    resp: resp ?? null,
    current_pvp: input.current_pvp,
    proposed_pvp: input.proposed_pvp,
  });
  if (error) return { ok: false, error: 'No se pudo enviar la propuesta.' };
  redirect('/propuestas?ok=1');
}
