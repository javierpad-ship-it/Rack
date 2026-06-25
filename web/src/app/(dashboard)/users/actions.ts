'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import type { UserRole } from '@/lib/types';

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
}

export interface UserRow {
  id: string;
  email: string | null;
  full_name: string | null;
  role: UserRole;
  store_id: string | null;
}

export async function listUsers(): Promise<UserRow[]> {
  await assertAdmin();
  const admin = createAdminClient();
  const { data: profiles } = await admin
    .from('profiles')
    .select('id, full_name, role, store_id');
  const { data: authList } = await admin.auth.admin.listUsers();
  const emailById = new Map(authList.users.map((u) => [u.id, u.email ?? null]));
  return (profiles ?? []).map((p) => ({
    id: p.id,
    email: emailById.get(p.id) ?? null,
    full_name: p.full_name,
    role: p.role as UserRole,
    store_id: p.store_id,
  }));
}

export async function createUser(args: {
  email: string;
  password: string;
  fullName: string;
  role: UserRole;
  storeId: string | null;
}) {
  await assertAdmin();
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.createUser({
    email: args.email,
    password: args.password,
    email_confirm: true,
    user_metadata: { full_name: args.fullName },
  });
  if (error) throw new Error(error.message);
  // El trigger handle_new_user crea el profile; actualizamos rol/tienda.
  const { error: pErr } = await admin
    .from('profiles')
    .update({ full_name: args.fullName, role: args.role, store_id: args.storeId })
    .eq('id', data.user.id);
  if (pErr) throw new Error(pErr.message);
  return { id: data.user.id };
}

export async function updateUser(id: string, role: UserRole, storeId: string | null) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin
    .from('profiles')
    .update({ role, store_id: storeId })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteUser(id: string) {
  await assertAdmin();
  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(id);
  if (error) throw new Error(error.message);
}
