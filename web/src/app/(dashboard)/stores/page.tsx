'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';

export default function StoresPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('stores').select('*').order('name');
    setStores((data ?? []) as Store[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('stores').insert({ code, name });
    if (error) setError(error.message);
    else {
      setCode('');
      setName('');
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar tienda? Se borran sus muebles y datos asociados.')) return;
    const { error } = await supabase.from('stores').delete().eq('id', id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <h1>Tiendas</h1>
      <form className="panel row" onSubmit={addStore} style={{ marginBottom: 16 }}>
        <input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} required />
        <input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required />
        <button>Agregar</button>
        {error && <span style={{ color: '#ff6b6b' }}>{error}</span>}
      </form>
      <table className="panel">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td>
              <td>{s.name}</td>
              <td>
                <button className="secondary" onClick={() => remove(s.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {stores.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Sin tiendas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
