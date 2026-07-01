import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import SignOutButton from './SignOutButton';
import NavLinks from './NavLinks';
import BrandLogo from '@/components/BrandLogo';

const NAV: { href: string; label: string; roles: Profile['role'][] }[] = [
  { href: '/', label: 'Resumen', roles: ['admin', 'analista', 'visual', 'encargado', 'operario', 'reponedor'] },
  { href: '/stores', label: 'Tiendas', roles: ['admin'] },
  { href: '/fixtures', label: 'Muebles', roles: ['admin', 'visual', 'encargado'] },
  { href: '/labels', label: 'Etiquetas', roles: ['admin', 'visual', 'encargado'] },
  { href: '/layout', label: 'Plano', roles: ['admin', 'visual'] },
  { href: '/import', label: 'Importar', roles: ['admin'] },
  { href: '/calendar', label: 'Calendario', roles: ['admin'] },
  { href: '/coverage', label: 'Cobertura', roles: ['admin', 'analista', 'encargado', 'visual'] },
  { href: '/alerts', label: 'Alertas', roles: ['admin', 'analista', 'encargado'] },
  { href: '/reports', label: 'Reportes', roles: ['admin', 'analista', 'encargado'] },
  { href: '/trends', label: 'Tendencias', roles: ['admin', 'analista', 'encargado'] },
  { href: '/monthly', label: 'Mensual', roles: ['admin', 'analista', 'encargado'] },
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
    <div style={{ display: 'grid', gridTemplateColumns: '232px 1fr', minHeight: '100vh' }}>
      <aside className="side">
        <div className="brand">
          <BrandLogo variant="sidebar" />
          <span className="brand-by">Lukers</span>
        </div>
        <NavLinks items={items.map(({ href, label }) => ({ href, label }))} />
        <div className="who">
          <div className="name">{profile?.full_name ?? user.email}</div>
          <span className="role-badge">{role}</span>
          <div style={{ marginTop: 12 }}>
            <SignOutButton />
          </div>
        </div>
      </aside>
      <main className="content">{children}</main>
    </div>
  );
}
