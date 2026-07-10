'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { dniToEmail, isValidDni } from '@/lib/dni';
import type { UserRole } from '@/lib/types';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<string | null> {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  return profile?.role === 'admin' ? user.id : null;
}

export type PrismaUserRow = {
  id: string;
  dni: string;
  full_name: string | null;
  role: UserRole;
  must_change_password: boolean;
  store_ids: string[];
  lines: string[];
};

export async function listPrismaUsers(): Promise<ActionResult<PrismaUserRow[]>> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();

  const { data: profiles, error: pErr } = await admin
    .from('profiles')
    .select('id, dni, full_name, role, must_change_password')
    .not('dni', 'is', null)
    .order('full_name');
  if (pErr) return { ok: false, error: pErr.message };

  const ids = (profiles ?? []).map((p) => p.id);
  const { data: stores } = ids.length
    ? await admin.from('user_stores').select('user_id, store_id').in('user_id', ids)
    : { data: [] };
  const { data: lines } = ids.length
    ? await admin.from('user_lines').select('user_id, resp').in('user_id', ids)
    : { data: [] };

  const storesByUser = new Map<string, string[]>();
  (stores ?? []).forEach((r) => storesByUser.set(r.user_id, [...(storesByUser.get(r.user_id) ?? []), r.store_id]));
  const linesByUser = new Map<string, string[]>();
  (lines ?? []).forEach((r) => linesByUser.set(r.user_id, [...(linesByUser.get(r.user_id) ?? []), r.resp]));

  const rows: PrismaUserRow[] = (profiles ?? []).map((p) => ({
    id: p.id,
    dni: p.dni!,
    full_name: p.full_name,
    role: p.role as UserRole,
    must_change_password: p.must_change_password,
    store_ids: storesByUser.get(p.id) ?? [],
    lines: linesByUser.get(p.id) ?? [],
  }));
  return { ok: true, data: rows };
}

// Líneas (resp) conocidas, para elegir responsables — de la foto de stock más reciente.
export async function listLineOptions(): Promise<ActionResult<string[]>> {
  const admin = createAdminClient();
  const { data: snap } = await admin.from('stock_snapshots').select('snapshot_date').order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
  if (!snap) return { ok: true, data: [] };
  const { data, error } = await admin
    .from('stock_snapshots')
    .select('resp')
    .eq('snapshot_date', snap.snapshot_date)
    .not('resp', 'is', null);
  if (error) return { ok: false, error: error.message };
  const set = new Set((data ?? []).map((r) => r.resp as string).filter(Boolean));
  return { ok: true, data: [...set].sort() };
}

export async function createPrismaUser(args: {
  dni: string;
  fullName: string;
  role: UserRole;
  storeIds: string[];
}): Promise<ActionResult<{ id: string }>> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  if (!isValidDni(args.dni)) return { ok: false, error: 'DNI inválido (solo números, 6-12 dígitos).' };
  if (!args.storeIds.length) return { ok: false, error: 'Asigna al menos una tienda.' };

  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: dniToEmail(args.dni),
    password: args.dni,
    email_confirm: true,
    user_metadata: { full_name: args.fullName },
  });
  if (error) return { ok: false, error: error.message };

  const { error: pErr } = await admin
    .from('profiles')
    .update({ full_name: args.fullName, role: args.role, dni: args.dni, must_change_password: true })
    .eq('id', data.user.id);
  if (pErr) return { ok: false, error: `Usuario creado pero falló el perfil: ${pErr.message}` };

  const { error: sErr } = await admin
    .from('user_stores')
    .insert(args.storeIds.map((store_id) => ({ user_id: data.user.id, store_id })));
  if (sErr) return { ok: false, error: `Usuario creado pero fallaron las tiendas: ${sErr.message}` };

  return { ok: true, data: { id: data.user.id } };
}

export async function updateUserRole(userId: string, role: UserRole): Promise<ActionResult> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();
  const { error } = await admin.from('profiles').update({ role }).eq('id', userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function updateUserStores(userId: string, storeIds: string[]): Promise<ActionResult> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();
  const { error: dErr } = await admin.from('user_stores').delete().eq('user_id', userId);
  if (dErr) return { ok: false, error: dErr.message };
  if (storeIds.length) {
    const { error: iErr } = await admin.from('user_stores').insert(storeIds.map((store_id) => ({ user_id: userId, store_id })));
    if (iErr) return { ok: false, error: iErr.message };
  }
  return { ok: true };
}

export async function updateUserLines(userId: string, lines: string[]): Promise<ActionResult> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();
  const { error: dErr } = await admin.from('user_lines').delete().eq('user_id', userId);
  if (dErr) return { ok: false, error: dErr.message };
  if (lines.length) {
    const { error: iErr } = await admin.from('user_lines').insert(lines.map((resp) => ({ user_id: userId, resp })));
    if (iErr) return { ok: false, error: iErr.message };
  }
  return { ok: true };
}

// Resetea la clave al DNI y fuerza cambio en el próximo ingreso.
export async function resetPrismaPassword(userId: string, dni: string): Promise<ActionResult> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();
  const { error: aErr } = await admin.auth.admin.updateUserById(userId, { password: dni });
  if (aErr) return { ok: false, error: aErr.message };
  const { error: pErr } = await admin.from('profiles').update({ must_change_password: true }).eq('id', userId);
  if (pErr) return { ok: false, error: pErr.message };
  return { ok: true };
}

export async function deletePrismaUser(userId: string): Promise<ActionResult> {
  const uid = await ensureAdmin();
  if (!uid) return { ok: false, error: 'Requiere rol admin.' };
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
