import { createClient } from '@/lib/supabase/server';
import { getSelectedStoreId, type PrismaStore } from '@/lib/store';
import StorePicker from './StorePicker';

export const dynamic = 'force-dynamic';

export default async function TiendaPage() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const { data: stores } = await supabase.rpc('my_stores');
  const { data: profile } = user
    ? await supabase.from('profiles').select('full_name').eq('id', user.id).single()
    : { data: null };

  const list = (stores ?? []) as PrismaStore[];
  const selected = getSelectedStoreId();

  return (
    <main className="app">
      <div className="appbar">
        <div>
          <h1>¿En qué tienda estás?</h1>
          <div className="sub">Hola, {profile?.full_name ?? 'usuario'}</div>
        </div>
      </div>
      <div className="body">
        <div className="eyebrow">Tus tiendas asignadas</div>
        {list.length === 0 ? (
          <div className="empty">No tienes tiendas asignadas. Avisa al administrador.</div>
        ) : (
          <StorePicker stores={list} selected={selected} />
        )}
      </div>
    </main>
  );
}
