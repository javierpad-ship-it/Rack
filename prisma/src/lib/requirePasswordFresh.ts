import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

// Si la clave del usuario sigue siendo su DNI (o fue reseteada), lo manda a
// cambiarla antes de dejarlo usar el resto de la app.
export async function assertPasswordFresh() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return;
  const { data: profile } = await supabase
    .from('profiles')
    .select('must_change_password')
    .eq('id', user.id)
    .single();
  if (profile?.must_change_password) redirect('/cambiar-clave');
}
