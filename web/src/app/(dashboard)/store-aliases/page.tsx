'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';
import { listStoreAliases, upsertStoreAlias, deleteStoreAlias, type StoreAliasRow } from './actions';

export default function StoreAliasesPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [rows, setRows] = useState<StoreAliasRow[]>([]);
  const [alias, setAlias] = useState('');
  const [storeId, setStoreId] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listStoreAliases();
    if (res.ok) setRows(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('name')
      .then(({ data }) => {
        const s = (data ?? []) as Store[];
        setStores(s);
        if (s[0]) setStoreId(s[0].id);
      });
    load();
  }, [supabase, load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await upsertStoreAlias(alias, storeId);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setAlias('');
    load();
  }

  async function remove(a: string) {
    if (!confirm(`¿Eliminar el mapeo "${a}"?`)) return;
    const res = await deleteStoreAlias(a);
    if (!res.ok) setError(res.error);
    load();
  }

  return (
    <div>
      <span className="eyebrow">Mantenimiento</span>
      <h1>Mapeo de tiendas</h1>
      <p className="muted">
        Asociá el nombre de tienda tal como aparece en tus archivos de <b>Ventas</b> y <b>Stock</b> (la
        columna TIENDA de QlikView) con la tienda correspondiente en Rack One. Al importar un archivo
        con varias tiendas, cada fila se reparte sola usando este mapeo.
      </p>

      <form className="panel row" onSubmit={add} style={{ marginBottom: 16 }}>
        <input
          placeholder="Nombre en el archivo (ej. LUKERS ALFONSO UGARTE)"
          value={alias}
          onChange={(e) => setAlias(e.target.value)}
          style={{ minWidth: 280 }}
          required
        />
        <span className="muted">→</span>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button>Agregar</button>
        {error && <span className="neg">{error}</span>}
      </form>

      <table className="panel">
        <thead>
          <tr>
            <th>Nombre en el archivo</th>
            <th>Tienda en Rack One</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.alias}>
              <td>
                <code>{r.alias}</code>
              </td>
              <td>{r.store_name}</td>
              <td>
                <button className="secondary" onClick={() => remove(r.alias)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Sin mapeos todavía. Si importás un archivo con tiendas sin mapear, te va a avisar cuáles
                faltan acá.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
