'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Fixture, Store } from '@/lib/types';

export default function FixturesPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [floor, setFloor] = useState(1);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const selectedStore = stores.find((s) => s.id === storeId);
  const floorCount = selectedStore?.floors ?? 1;

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
  }, [supabase]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase
      .from('fixtures')
      .select('*')
      .eq('store_id', storeId)
      .order('name');
    setFixtures((data ?? []) as Fixture[]);
  }, [supabase, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Si cambia la tienda y el piso elegido no existe, volver al piso 1.
  useEffect(() => {
    if (floor > floorCount) setFloor(1);
  }, [floorCount, floor]);

  async function addFixture(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    // El código (barcode) lo genera la base: códigoTienda + piso + 4 dígitos.
    const { error } = await supabase
      .from('fixtures')
      .insert({ store_id: storeId, floor, name });
    if (error) setError(error.message);
    else {
      setName('');
      load();
    }
  }

  async function toggleActive(f: Fixture) {
    await supabase.from('fixtures').update({ active: !f.active }).eq('id', f.id);
    load();
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar mueble?')) return;
    await supabase.from('fixtures').delete().eq('id', id);
    load();
  }

  return (
    <div>
      <h1>Muebles</h1>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          Tienda{' '}
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      <form className="panel row" onSubmit={addFixture} style={{ marginBottom: 16 }}>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Piso
          <select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
            {Array.from({ length: floorCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <input
          placeholder="Nombre del mueble"
          value={name}
          onChange={(e) => setName(e.target.value)}
          required
        />
        <button disabled={!storeId}>Agregar</button>
        <span className="muted" style={{ fontSize: 13 }}>
          Código: <b>{selectedStore ? `${selectedStore.code}${floor}####` : '—'}</b> (automático)
        </span>
        {error && <span className="neg">{error}</span>}
      </form>

      <table className="panel">
        <thead>
          <tr>
            <th>Código</th>
            <th>Piso</th>
            <th>Nombre</th>
            <th>Pin</th>
            <th>Estado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {fixtures.map((f) => (
            <tr key={f.id}>
              <td><code>{f.barcode}</code></td>
              <td>{f.floor}</td>
              <td>{f.name}</td>
              <td className="muted">
                {f.pin_x != null ? `${f.pin_x.toFixed(2)}, ${f.pin_y?.toFixed(2)}` : 'sin ubicar'}
              </td>
              <td>{f.active ? 'Activo' : 'Inactivo'}</td>
              <td className="row">
                <button className="secondary" onClick={() => toggleActive(f)}>
                  {f.active ? 'Desactivar' : 'Activar'}
                </button>
                <button className="secondary" onClick={() => remove(f.id)}>
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {fixtures.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Sin muebles en esta tienda. Ubicalos en el plano desde la sección Plano.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
