'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store, UserRole } from '@/lib/types';
import { listUsers, createUser, updateUser, deleteUser, type UserRow } from './actions';

const ROLES: UserRole[] = ['admin', 'analista', 'visual', 'encargado', 'operario'];

export default function UsersPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [error, setError] = useState<string | null>(null);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [role, setRole] = useState<UserRole>('operario');
  const [storeId, setStoreId] = useState<string>('');

  const load = useCallback(async () => {
    try {
      setUsers(await listUsers());
    } catch (e) {
      setError((e as Error).message);
    }
  }, []);

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('name')
      .then(({ data }) => setStores((data ?? []) as Store[]));
    load();
  }, [supabase, load]);

  async function onCreate(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await createUser({ email, password, fullName, role, storeId: storeId || null });
      setEmail('');
      setPassword('');
      setFullName('');
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  }

  return (
    <div>
      <h1>Usuarios</h1>
      <form className="panel row" onSubmit={onCreate} style={{ marginBottom: 16 }}>
        <input placeholder="Nombre" value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        <input type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input
          type="password"
          placeholder="Contraseña"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        <select value={role} onChange={(e) => setRole(e.target.value as UserRole)}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {r}
            </option>
          ))}
        </select>
        <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">(sin tienda / central)</option>
          {stores.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name}
            </option>
          ))}
        </select>
        <button>Crear</button>
        {error && <span style={{ color: '#ff6b6b' }}>{error}</span>}
      </form>

      <table className="panel">
        <thead>
          <tr>
            <th>Nombre</th>
            <th>Email</th>
            <th>Rol</th>
            <th>Tienda</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {users.map((u) => (
            <tr key={u.id}>
              <td>{u.full_name ?? '—'}</td>
              <td>{u.email ?? '—'}</td>
              <td>
                <select
                  value={u.role}
                  onChange={async (e) => {
                    await updateUser(u.id, e.target.value as UserRole, u.store_id);
                    load();
                  }}
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <select
                  value={u.store_id ?? ''}
                  onChange={async (e) => {
                    await updateUser(u.id, u.role, e.target.value || null);
                    load();
                  }}
                >
                  <option value="">central</option>
                  {stores.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </td>
              <td>
                <button
                  className="secondary"
                  onClick={async () => {
                    if (confirm('¿Eliminar usuario?')) {
                      await deleteUser(u.id);
                      load();
                    }
                  }}
                >
                  Eliminar
                </button>
              </td>
            </tr>
          ))}
          {users.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Sin usuarios.
              </td>
            </tr>
          )}
        </tbody>
      </table>
      <p className="muted" style={{ fontSize: 12 }}>
        Nota: la columna Tienda aplica a roles visual / encargado / operario.
      </p>
    </div>
  );
}
