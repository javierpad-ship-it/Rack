'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { dniToEmail, isValidDni } from '@/lib/dni';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const [dni, setDni] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [forgot, setForgot] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!isValidDni(dni)) {
      setError('Ingresa un DNI válido (solo números).');
      return;
    }
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({
      email: dniToEmail(dni),
      password,
    });
    setLoading(false);
    if (error) setError('DNI o clave incorrectos.');
    else router.replace('/');
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

        <div>
          <label className="field" htmlFor="dni">DNI</label>
          <span className="input">
            <input
              id="dni"
              inputMode="numeric"
              autoComplete="username"
              placeholder="Tu número de DNI"
              value={dni}
              onChange={(e) => setDni(e.target.value)}
              required
            />
          </span>
        </div>

        <div>
          <label className="field" htmlFor="pass">Clave</label>
          <PasswordInput value={password} onChange={setPassword} autoComplete="current-password" required />
        </div>

        {error && <p className="neg">{error}</p>}

        <button className="btn primary" disabled={loading}>
          {loading ? 'Ingresando…' : 'Ingresar'}
        </button>

        <button type="button" className="link" style={{ alignSelf: 'center' }} onClick={() => setForgot(true)}>
          ¿Olvidaste tu clave?
        </button>
        {forgot && (
          <div className="notice">
            Acércate al <b>administrador</b> para resetearla. La dejará en <b>tu DNI</b> y te pedirá cambiarla al ingresar.
          </div>
        )}

        <div style={{ flex: 1 }} />
        <p className="hint">
          Primera vez: clave = tu DNI.<br />
          Te pediremos cambiarla al ingresar.
        </p>
      </form>
    </main>
  );
}
