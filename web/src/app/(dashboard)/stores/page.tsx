'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store, Empresa } from '@/lib/types';

export default function StoresPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [floors, setFloors] = useState(1);
  const [empresaId, setEmpresaId] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Edición inline de la empresa asignada a una tienda ya creada.
  const [editId, setEditId] = useState<string | null>(null);
  const [editEmpresaId, setEditEmpresaId] = useState('');

  const load = useCallback(async () => {
    const [{ data: st }, { data: em }] = await Promise.all([
      supabase.from('stores').select('*').order('name'),
      supabase.from('empresas').select('*').order('nombre'),
    ]);
    setStores((st ?? []) as Store[]);
    setEmpresas((em ?? []) as Empresa[]);
  }, [supabase]);

  useEffect(() => {
    load();
  }, [load]);

  const empresaName = (id: string | null) => empresas.find((e) => e.id === id)?.nombre ?? null;

  async function addStore(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('stores').insert({ code, name, floors, empresa_id: empresaId || null });
    if (error) setError(error.message);
    else {
      setCode('');
      setName('');
      setFloors(1);
      setEmpresaId('');
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar tienda? Se borran sus muebles y datos asociados.')) return;
    const { error } = await supabase.from('stores').delete().eq('id', id);
    if (error) setError(error.message);
    else load();
  }

  function startEdit(s: Store) {
    setEditId(s.id);
    setEditEmpresaId(s.empresa_id ?? '');
  }

  async function saveEmpresa(id: string) {
    setError(null);
    const { error } = await supabase.from('stores').update({ empresa_id: editEmpresaId || null }).eq('id', id);
    if (error) setError(error.message);
    else { setEditId(null); load(); }
  }

  return (
    <div>
      <h1>Tiendas</h1>
      <form className="panel row" onSubmit={addStore} style={{ marginBottom: 16, gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>Código<br /><input placeholder="Código" value={code} onChange={(e) => setCode(e.target.value)} required /></label>
        <label>Nombre<br /><input placeholder="Nombre" value={name} onChange={(e) => setName(e.target.value)} required /></label>
        <label className="muted" style={{ display: 'flex', flexDirection: 'column' }}>
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
        <label>Empresa<br />
          <select value={empresaId} onChange={(e) => setEmpresaId(e.target.value)}>
            <option value="">Sin asignar</option>
            {empresas.map((em) => <option key={em.id} value={em.id}>{em.nombre}</option>)}
          </select>
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
            <th>Empresa</th>
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
                {editId === s.id ? (
                  <select value={editEmpresaId} onChange={(e) => setEditEmpresaId(e.target.value)}>
                    <option value="">Sin asignar</option>
                    {empresas.map((em) => <option key={em.id} value={em.id}>{em.nombre}</option>)}
                  </select>
                ) : (
                  empresaName(s.empresa_id) ?? <span className="muted">Sin asignar</span>
                )}
              </td>
              <td className="row" style={{ gap: 6 }}>
                {editId === s.id ? (
                  <>
                    <button onClick={() => saveEmpresa(s.id)}>Guardar</button>
                    <button className="secondary" onClick={() => setEditId(null)}>Cancelar</button>
                  </>
                ) : (
                  <>
                    <button className="secondary" onClick={() => startEdit(s)}>Editar empresa</button>
                    <button className="secondary" onClick={() => remove(s.id)}>Eliminar</button>
                  </>
                )}
              </td>
            </tr>
          ))}
          {stores.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Sin tiendas todavía.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
