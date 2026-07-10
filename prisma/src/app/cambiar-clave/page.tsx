'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import PasswordInput from '@/components/PasswordInput';

export default function ChangePasswordPage() {
  const router = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError('La clave debe tener al menos 6 caracteres.'); return; }
    if (password !== confirm) { setError('Las claves no coinciden.'); return; }
    setLoading(true);
    const supabase = createClient();
    const { error: upErr } = await supabase.auth.updateUser({ password });
    if (upErr) { setLoading(false); setError('No se pudo cambiar la clave: ' + upErr.message); return; }
    const { error: rpcErr } = await supabase.rpc('complete_password_change');
    setLoading(false);
    if (rpcErr) { setError('Clave cambiada, pero hubo un error al confirmar: ' + rpcErr.message); return; }
    router.replace('/tienda');
  }

  return (
    <main className="login">
      <form className="inner" onSubmit={onSubmit}>
        <div className="brand">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/icon.svg" alt="Prisma" width={88} height={88} />
          <div className="n">PRISMA</div>
          <div className="s">RACK ONE</div>
        </div>

        <p className="hint" style={{ textAlign: 'left' }}>
          Por seguridad, debes cambiar tu clave antes de continuar. Ya no podrás usar tu DNI como clave.
        </p>

        <div>
          <label className="field" htmlFor="p1">Nueva clave</label>
          <PasswordInput value={password} onChange={setPassword} autoComplete="new-password" required />
        </div>
        <div>
          <label className="field" htmlFor="p2">Confirmar clave</label>
          <PasswordInput value={confirm} onChange={setConfirm} placeholder="Repite la clave" autoComplete="new-password" required />
        </div>

        {error && <p className="neg">{error}</p>}

        <button className="btn primary" disabled={loading}>
          {loading ? 'Guardando…' : 'Guardar y continuar'}
        </button>
      </form>
    </main>
  );
}
