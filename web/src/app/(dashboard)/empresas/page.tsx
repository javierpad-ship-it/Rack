'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Empresa = {
  id: string;
  nombre: string;
  nombre_reporte: string | null;
  codigo_sap: string | null;
};

export default function EmpresasPage() {
  const supabase = createClient();
  const [empresas, setEmpresas] = useState<Empresa[]>([]);
  const [nombre, setNombre] = useState('');
  const [nombreReporte, setNombreReporte] = useState('');
  const [codigoSap, setCodigoSap] = useState('');
  const [error, setError] = useState<string | null>(null);
  // Edición inline: id en edición + valores.
  const [editId, setEditId] = useState<string | null>(null);
  const [edit, setEdit] = useState<{ nombre: string; nombre_reporte: string; codigo_sap: string }>({
    nombre: '', nombre_reporte: '', codigo_sap: '',
  });

  const load = useCallback(async () => {
    const { data, error } = await supabase.from('empresas').select('*').order('nombre');
    if (error) setError(error.message);
    else setEmpresas((data ?? []) as Empresa[]);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  async function add(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const { error } = await supabase.from('empresas').insert({
      nombre: nombre.trim(),
      nombre_reporte: nombreReporte.trim() || null,
      codigo_sap: codigoSap.trim() || null,
    });
    if (error) setError(error.message);
    else {
      setNombre(''); setNombreReporte(''); setCodigoSap('');
      load();
    }
  }

  function startEdit(em: Empresa) {
    setEditId(em.id);
    setEdit({ nombre: em.nombre, nombre_reporte: em.nombre_reporte ?? '', codigo_sap: em.codigo_sap ?? '' });
  }

  async function saveEdit(id: string) {
    setError(null);
    const { error } = await supabase.from('empresas').update({
      nombre: edit.nombre.trim(),
      nombre_reporte: edit.nombre_reporte.trim() || null,
      codigo_sap: edit.codigo_sap.trim() || null,
    }).eq('id', id);
    if (error) setError(error.message);
    else { setEditId(null); load(); }
  }

  async function remove(id: string) {
    if (!confirm('¿Eliminar empresa?')) return;
    const { error } = await supabase.from('empresas').delete().eq('id', id);
    if (error) setError(error.message);
    else load();
  }

  return (
    <div>
      <h1>Empresas</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Empresa con su nombre, el nombre que debe aparecer en los reportes y su código SAP.
      </p>

      <form className="panel row" onSubmit={add} style={{ marginBottom: 16, gap: 10, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <label>Nombre<br /><input placeholder="Nombre" value={nombre} onChange={(e) => setNombre(e.target.value)} required /></label>
        <label>Nombre reporte<br /><input placeholder="Nombre en reportes" value={nombreReporte} onChange={(e) => setNombreReporte(e.target.value)} /></label>
        <label>Código SAP<br /><input placeholder="Código SAP" value={codigoSap} onChange={(e) => setCodigoSap(e.target.value)} /></label>
        <button type="submit">Agregar</button>
      </form>

      {error && <p className="neg">Error: {error}</p>}

      <table className="panel">
        <thead>
          <tr><th>Nombre</th><th>Nombre reporte</th><th>Código SAP</th><th></th></tr>
        </thead>
        <tbody>
          {empresas.map((em) => (
            <tr key={em.id}>
              {editId === em.id ? (
                <>
                  <td><input value={edit.nombre} onChange={(e) => setEdit({ ...edit, nombre: e.target.value })} /></td>
                  <td><input value={edit.nombre_reporte} onChange={(e) => setEdit({ ...edit, nombre_reporte: e.target.value })} /></td>
                  <td><input value={edit.codigo_sap} onChange={(e) => setEdit({ ...edit, codigo_sap: e.target.value })} /></td>
                  <td className="row" style={{ gap: 6 }}>
                    <button onClick={() => saveEdit(em.id)}>Guardar</button>
                    <button className="secondary" onClick={() => setEditId(null)}>Cancelar</button>
                  </td>
                </>
              ) : (
                <>
                  <td>{em.nombre}</td>
                  <td>{em.nombre_reporte ?? <span className="muted">—</span>}</td>
                  <td>{em.codigo_sap ?? <span className="muted">—</span>}</td>
                  <td className="row" style={{ gap: 6 }}>
                    <button className="secondary" onClick={() => startEdit(em)}>Editar</button>
                    <button className="secondary" onClick={() => remove(em.id)}>Eliminar</button>
                  </td>
                </>
              )}
            </tr>
          ))}
          {empresas.length === 0 && <tr><td colSpan={4} className="muted">Sin empresas. Agregá la primera arriba.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
