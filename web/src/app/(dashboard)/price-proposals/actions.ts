'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

async function currentUser() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

export type ProposalStatus = 'pendiente' | 'aceptada' | 'denegada' | 'contrapropuesta';

export type ProposalRow = {
  id: number;
  generic_code: string;
  sku: string | null;
  resp: string | null;
  solicitante: string | null;
  tienda: string | null;
  sales_org: string | null;
  descripcion: string | null;
  genero: string | null;
  marca: string | null;
  mundo: string | null;
  current_pvp: number | null;
  proposed_pvp: number;
  costo_prom: number | null;
  stock_tienda: number;
  rot_tienda: number;
  stock_cadena: number;
  rot_cadena: number;
};

// Bandeja: usa el RPC price_proposals_review (RLS ya filtra por responsable de línea / admin).
export async function listProposals(status: ProposalStatus): Promise<ActionResult<ProposalRow[]>> {
  const user = await currentUser();
  if (!user) return { ok: false, error: 'No autenticado.' };
  const supabase = createClient();
  const { data, error } = await supabase.rpc('price_proposals_review', { p_status: status, p_window_days: 30 });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as ProposalRow[] };
}

async function assertCanDecide(proposalId: number): Promise<string | null> {
  const user = await currentUser();
  if (!user) return 'No autenticado.';
  const supabase = createClient();
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role === 'admin') return null;
  const { data: prop } = await supabase.from('price_proposals').select('resp').eq('id', proposalId).single();
  if (!prop?.resp) return 'Propuesta sin línea asignada.';
  const { data: line } = await supabase
    .from('user_lines').select('resp').eq('user_id', user.id).eq('resp', prop.resp).maybeSingle();
  if (!line) return 'No eres responsable de esta línea.';
  return null;
}

async function decide(
  proposalId: number,
  status: Exclude<ProposalStatus, 'pendiente'>,
  decidedPvp: number | null,
  note: string | null,
): Promise<ActionResult> {
  const permErr = await assertCanDecide(proposalId);
  if (permErr) return { ok: false, error: permErr };
  const user = await currentUser();
  const admin = createAdminClient();
  const { error } = await admin
    .from('price_proposals')
    .update({
      status,
      decided_pvp: decidedPvp,
      review_note: note,
      reviewed_by: user!.id,
      reviewed_at: new Date().toISOString(),
      seen_by_requester_at: null, // dispara la alerta en Prisma
    })
    .eq('id', proposalId);
  if (error) return { ok: false, error: error.message };
  revalidatePath('/price-proposals');
  return { ok: true };
}

export async function acceptProposal(id: number, proposedPvp: number, note?: string): Promise<ActionResult> {
  return decide(id, 'aceptada', proposedPvp, note ?? null);
}

export async function denyProposal(id: number, note?: string): Promise<ActionResult> {
  return decide(id, 'denegada', null, note ?? null);
}

export async function counterProposal(id: number, counterPvp: number, note?: string): Promise<ActionResult> {
  if (!(counterPvp > 0)) return { ok: false, error: 'Precio inválido.' };
  return decide(id, 'contrapropuesta', counterPvp, note ?? null);
}

export async function listLineOptions(): Promise<ActionResult<string[]>> {
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('price_proposals')
    .select('resp')
    .not('resp', 'is', null);
  if (error) return { ok: false, error: error.message };
  const set = new Set((data ?? []).map((r) => r.resp as string));
  return { ok: true, data: [...set].sort() };
}
