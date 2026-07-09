'use server';

import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { STORE_COOKIE } from '@/lib/store';
import { createClient } from '@/lib/supabase/server';

// Fija la tienda seleccionada (validando que el usuario tenga acceso) y vuelve al inicio.
export async function selectStore(storeId: string) {
  const supabase = createClient();
  const { data, error } = await supabase.rpc('can_use_store', { p_store: storeId });
  if (error || data !== true) {
    throw new Error('No tienes acceso a esa tienda.');
  }
  cookies().set(STORE_COOKIE, storeId, {
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 180,
  });
  redirect('/');
}
