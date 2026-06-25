'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';

export default function StoresPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [floors, setFloors] = useState(1);
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
    const { error } = await supabase.from('stores').insert({ code, name, floors });
    if (error) setError(error.message);
    else {
      setCode('');
      setName('');
      setFloors(1);
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
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Pisos
          <input
            type="number"
            min={1}
            max={50}
            value={floors}
            onChange={(e) => setFloors(Math.max(1, Number(e.target.value)))}
            style={{ width: 72 }}
            required
          />
        </label>
        <button>Agregar</button>
        {error && <span className="neg">{error}</span>}
      </form>
      <table className="panel">
        <thead>
          <tr>
            <th>Código</th>
            <th>Nombre</th>
            <th>Pisos</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {stores.map((s) => (
            <tr key={s.id}>
              <td>{s.code}</td>
              <td>{s.name}</td>
              <td>{s.floors}</td>
              <td>
                <button className="secondary" onClick={() => remove(s.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {stores.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Sin tiendas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
