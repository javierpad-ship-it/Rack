'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import BrandLogo from '@/components/BrandLogo';
import PasswordInput from '@/components/PasswordInput';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) setError(error.message);
    else router.replace('/');
  }

  return (
    <main className="auth">
      <section className="auth-brand">
        <div className="lockup">
          <BrandLogo variant="login" />
        </div>
        <p className="slogan">
          Rotación y venta por mueble, <em>en foco</em>.
        </p>
        <p className="foot">LUKERS · Powered by Rack One</p>
        <span className="ghost" aria-hidden="true" />
      </section>

      <section className="auth-form">
        <form onSubmit={onSubmit}>
          <span className="eyebrow">Acceso</span>
          <h1>Ingresar</h1>
          <p className="muted">Panel de administración de Lukers.</p>
          <div className="fields">
            <input
              type="email"
              placeholder="Email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
            <PasswordInput
              value={password}
              onChange={setPassword}
              autoComplete="current-password"
              required
            />
            {error && <p className="neg" style={{ margin: 0 }}>{error}</p>}
            <button className="gold" disabled={loading}>
              {loading ? 'Ingresando…' : 'Ingresar'}
            </button>
          </div>
        </form>
      </section>
    </main>
  );
}
