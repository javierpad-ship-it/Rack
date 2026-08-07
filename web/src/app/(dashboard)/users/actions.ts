'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/types';

// Resultado uniforme: nunca lanzamos al cliente (Next enmascara los throws en
// producción con un mensaje genérico). Devolvemos el motivo real.
export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

function envProblem(): string | null {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) return 'Falta NEXT_PUBLIC_SUPABASE_URL en el servidor.';
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!k) return 'Falta SUPABASE_SERVICE_ROLE_KEY en el servidor.';
  if (k.length < 30) {
    return 'SUPABASE_SERVICE_ROLE_KEY parece inválida (demasiado corta). Cargá la service-role/secret key real de Supabase.';
  }
  return null;
}

async function ensureAdmin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'No autenticado.';
  const { data: profile, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single();
  if (error) return `No se pudo leer tu perfil: ${error.message}`;
  if (profile?.role !== 'admin') return 'Requiere rol admin.';
  return null;
}

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  store_id: string | null;
  lines: string[];
}

export async function listUsers(): Promise<ActionResult<UserRow[]>> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  try {
    const admin = createAdminClient();
    // Los usuarios de Prisma (login por DNI) se gestionan en /users-prisma, no aquí.
    const { data: profiles, error: pErr } = await admin
      .from('profiles')
      .select('id, full_name, role, store_id')
      .is('dni', null);
    if (pErr) return { ok: false, error: `profiles: ${pErr.message}` };

    const { data: authList, error: aErr } = await admin.auth.admin.listUsers();
    if (aErr) return { ok: false, error: `auth.admin: ${aErr.message}` };

    const ids = (profiles ?? []).map((p) => p.id);
    const { data: lineRows } = ids.length
      ? await admin.from('user_lines').select('user_id, resp').in('user_id', ids)
      : { data: [] };
    const linesByUser = new Map<string, string[]>();
    (lineRows ?? []).forEach((r) => linesByUser.set(r.user_id, [...(linesByUser.get(r.user_id) ?? []), r.resp]));

    const emailById = new Map(authList.users.map((u) => [u.id, u.email ?? null]));
    const rows: UserRow[] = (profiles ?? []).map((p) => ({
      id: p.id,
      email: emailById.get(p.id) ?? null,
      full_name: p.full_name,
      role: p.role as UserRole,
      store_id: p.store_id,
      lines: linesByUser.get(p.id) ?? [],
    }));
    return { ok: true, data: rows };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// Líneas (resp) conocidas — de la foto de stock más reciente, para elegir responsables.
export async function listLineOptions(): Promise<ActionResult<string[]>> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  const admin = createAdminClient();
  const { data: snap } = await admin
    .from('stock_snapshots').select('snapshot_date')
    .order('snapshot_date', { ascending: false }).limit(1).maybeSingle();
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

// Responsable de línea: quién aprueba/deniega/contrapropone las propuestas de
// precio de Prisma para esa(s) línea(s). No depende de cómo el usuario entra
// a Rack One (email o DNI) — solo de tener filas en user_lines.
export async function updateUserLines(userId: string, lines: string[]): Promise<ActionResult> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  try {
    const admin = createAdminClient();
    const { error: dErr } = await admin.from('user_lines').delete().eq('user_id', userId);
    if (dErr) return { ok: false, error: dErr.message };
    if (lines.length) {
      const { error: iErr } = await admin.from('user_lines').insert(lines.map((resp) => ({ user_id: userId, resp })));
      if (iErr) return { ok: false, error: iErr.message };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function createUser(args: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  storeId: string | null;
}): Promise<ActionResult<{ id: string }>> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  try {
    const admin = createAdminClient();
    const { data, error } = await admin.auth.admin.createUser({
      email: args.email,
      password: args.password,
      email_confirm: true,
      user_metadata: { full_name: args.fullName },
    });
    if (error) return { ok: false, error: error.message };

    // El trigger handle_new_user crea el profile; actualizamos rol/tienda.
    const { error: pErr } = await admin
      .from('profiles')
      .update({ full_name: args.fullName, role: args.role, store_id: args.storeId })
      .eq('id', data.user.id);
    if (pErr) return { ok: false, error: `Usuario creado pero falló el perfil: ${pErr.message}` };

    return { ok: true, data: { id: data.user.id } };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function updateUser(
  id: string,
  role: UserRole,
  storeId: string | null,
): Promise<ActionResult> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  try {
    const admin = createAdminClient();
    const { error } = await admin
      .from('profiles')
      .update({ role, store_id: storeId })
      .eq('id', id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

// El admin fija una contraseña nueva directo (sin mail de reset: muchos
// usuarios de tienda no revisan correo). El usuario la cambia si quiere desde
// su perfil.
export async function resetUserPassword(id: string, newPassword: string): Promise<ActionResult> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };
  if (newPassword.length < 6) return { ok: false, error: 'La contraseña debe tener al menos 6 caracteres.' };

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.updateUserById(id, { password: newPassword });
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}

export async function deleteUser(id: string): Promise<ActionResult> {
  const envErr = envProblem();
  if (envErr) return { ok: false, error: envErr };
  const adminErr = await ensureAdmin();
  if (adminErr) return { ok: false, error: adminErr };

  try {
    const admin = createAdminClient();
    const { error } = await admin.auth.admin.deleteUser(id);
    if (error) return { ok: false, error: error.message };
    return { ok: true };
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }
}
