'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';

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
    <main style={{ display: 'grid', placeItems: 'center', minHeight: '100vh' }}>
      <form className="panel" style={{ width: 340 }} onSubmit={onSubmit}>
        <h1 style={{ marginTop: 0 }}>Rack</h1>
        <p className="muted">Administración de rotación por mueble</p>
        <div style={{ display: 'grid', gap: 10 }}>
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
          />
          <input
            type="password"
            placeholder="Contraseña"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
          />
          {error && <p style={{ color: '#ff6b6b', margin: 0 }}>{error}</p>}
          <button disabled={loading}>{loading ? 'Ingresando…' : 'Ingresar'}</button>
        </div>
      </form>
    </main>
  );
}
