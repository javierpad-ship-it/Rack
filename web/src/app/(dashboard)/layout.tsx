import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import SignOutButton from './SignOutButton';

const NAV: { href: string; label: string; roles: Profile['role'][] }[] = [
  { href: '/', label: 'Resumen', roles: ['admin', 'analista', 'visual', 'encargado', 'operario'] },
  { href: '/stores', label: 'Tiendas', roles: ['admin'] },
  { href: '/fixtures', label: 'Muebles', roles: ['admin', 'visual', 'encargado'] },
  { href: '/layout', label: 'Plano', roles: ['admin', 'visual'] },
  { href: '/import', label: 'Importar', roles: ['admin'] },
  { href: '/reports', label: 'Reportes', roles: ['admin', 'analista', 'encargado'] },
  { href: '/users', label: 'Usuarios', roles: ['admin'] },
];

export default async function DashboardLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: profile } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single<Profile>();

  const role = profile?.role ?? 'operario';
  const items = NAV.filter((n) => n.roles.includes(role));

  return (
    <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', minHeight: '100vh' }}>
      <aside style={{ borderRight: '1px solid var(--border)', padding: 16 }}>
        <h2 style={{ marginTop: 0 }}>Rack</h2>
        <nav style={{ display: 'grid', gap: 6 }}>
          {items.map((n) => (
            <Link key={n.href} href={n.href}>
              {n.label}
            </Link>
          ))}
        </nav>
        <div style={{ marginTop: 24 }} className="muted">
          <div>{profile?.full_name ?? user.email}</div>
          <div style={{ fontSize: 12 }}>rol: {role}</div>
          <div style={{ marginTop: 8 }}>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main style={{ padding: 24 }}>{children}</main>
    </div>
  );
}
