'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store, UserRole } from '@/lib/types';
import {
  listPrismaUsers, listLineOptions, createPrismaUser, updateUserRole,
  updateUserStores, updateUserLines, resetPrismaPassword, deletePrismaUser,
  type PrismaUserRow,
} from './actions';

const ROLES: UserRole[] = ['admin', 'analista', 'visual', 'encargado', 'operario', 'reponedor'];

function StoreChecklist({ stores, value, onChange }: { stores: Store[]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, maxWidth: 420 }}>
      {stores.map((s) => (
        <label key={s.id} style={{ fontSize: 13 }}>
          <input
            type="checkbox"
            checked={value.includes(s.id)}
            onChange={(e) => onChange(e.target.checked ? [...value, s.id] : value.filter((id) => id !== s.id))}
          /> {s.name}
        </label>
      ))}
    </div>
  );
}

export default function UsersPrismaPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [lineOptions, setLineOptions] = useState<string[]>([]);
  const [users, setUsers] = useState<PrismaUserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [dni, setDni] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('operario');
  const [newStoreIds, setNewStoreIds] = useState<string[]>([]);

  const load = useCallback(async () => {
    const res = await listPrismaUsers();
    if (res.ok) setUsers(res.data); else setError(res.error);
  }, []);

  useEffect(() => {
    supabase.from('stores').select('*').order('name').then(({ data }) => setStores((data ?? []) as Store[]));
    listLineOptions().then((r) => { if (r.ok) setLineOptions(r.data); });
    load();
  }, [supabase, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await createPrismaUser({ dni, fullName, role, storeIds: newStoreIds });
    if (!res.ok) { setError(res.error); return; }
    setDni(''); setFullName(''); setNewStoreIds([]); setRole('operario');
    load();
  }

  return (
    <div>
      <h1>Usuarios Prisma</h1>
      <p className="muted">
        El usuario y la clave inicial son el <b>DNI</b>. Se le pedirá cambiar la clave al ingresar. Un usuario
        puede tener una o varias tiendas asignadas (elegirá/cambiará tienda dentro de la app).
      </p>

      <form className="panel" onSubmit={onCreate} style={{ marginBottom: 16, display: 'flex', flexDirection: 'column', gap: 10 }}>
        <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
          <input placeholder="DNI" inputMode="numeric" value={dni} onChange={(e) => setDni(e.target.value)} required />
          <input placeholder="Nombre completo" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
          <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <button className="gold">Crear usuario</button>
        </div>
        <div>
          <span className="muted" style={{ fontSize: 12 }}>Tiendas:</span>
          <StoreChecklist stores={stores} value={newStoreIds} onChange={setNewStoreIds} />
        </div>
        {error && <span className="neg">{error}</span>}
      </form>

      <table className="panel">
        <thead>
          <tr>
            <th>DNI</th><th>Nombre</th><th>Rol</th><th>Tiendas</th><th>Líneas (resp)</th><th>Clave</th><th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.dni}</td>
              <td>{u.full_name ?? '—'}</td>
              <td>
                <select
                  value={u.role}
                  onChange={async (e) => {
                    const res = await updateUserRole(u.id, e.target.value as UserRole);
                    if (!res.ok) setError(res.error);
                    load();
                  }}
                >
                  {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
              </td>
              <td>
                <StoreChecklist
                  stores={stores}
                  value={u.store_ids}
                  onChange={async (ids) => {
                    const res = await updateUserStores(u.id, ids);
                    if (!res.ok) setError(res.error);
                    load();
                  }}
                />
              </td>
              <td>
                <select
                  multiple
                  value={u.lines}
                  style={{ minWidth: 160, minHeight: 60 }}
                  onChange={async (e) => {
                    const vals = Array.from(e.target.selectedOptions).map((o) => o.value);
                    const res = await updateUserLines(u.id, vals);
                    if (!res.ok) setError(res.error);
                    load();
                  }}
                >
                  {lineOptions.map((l) => <option key={l} value={l}>{l}</option>)}
                </select>
              </td>
              <td>
                {u.must_change_password ? <span className="neg">debe cambiarla</span> : <span className="muted">ok</span>}
                <br />
                <button
                  className="secondary"
                  style={{ marginTop: 4 }}
                  onClick={async () => {
                    if (confirm(`¿Resetear la clave de ${u.full_name} a su DNI (${u.dni})?`)) {
                      const res = await resetPrismaPassword(u.id, u.dni);
                      if (!res.ok) setError(res.error);
                      load();
                    }
                  }}
                >
                  Reset clave
                </button>
              </td>
              <td>
                <button
                  className="secondary"
                  onClick={async () => {
                    if (confirm('¿Eliminar usuario?')) {
                      const res = await deletePrismaUser(u.id);
                      if (!res.ok) setError(res.error);
                      load();
                    }
                  }}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && <tr><td colSpan={7} className="muted">Sin usuarios Prisma.</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
