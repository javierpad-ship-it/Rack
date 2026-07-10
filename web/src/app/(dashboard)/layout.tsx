import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import type { Profile } from '@/lib/types';
import Sidebar from './Sidebar';

type NavItem = { href: string; label: string; roles: Profile['role'][] };
type NavSection = { label?: string; items: NavItem[] };

const ALL: Profile['role'][] = ['admin', 'analista', 'visual', 'encargado', 'operario', 'reponedor'];
const ANALYTICS: Profile['role'][] = ['admin', 'analista', 'encargado'];

const NAV_SECTIONS: NavSection[] = [
  // Análisis / operación (nivel superior)
  {
    items: [
      { href: '/', label: 'Resumen', roles: ALL },
      { href: '/coverage', label: 'Cobertura', roles: ['admin', 'analista', 'encargado', 'visual'] },
      { href: '/reports', label: 'Reportes', roles: ANALYTICS },
      { href: '/rotation', label: 'Rotación', roles: ANALYTICS },
      { href: '/floor', label: 'Piso vs Almacén', roles: ANALYTICS },
      { href: '/alerts', label: 'Alertas', roles: ANALYTICS },
      { href: '/trends', label: 'Tendencias', roles: ANALYTICS },
      { href: '/monthly', label: 'Mensual', roles: ANALYTICS },
    ],
  },
  // Carga de datos
  {
    items: [
      { href: '/import', label: 'Importar', roles: ['admin'] },
      { href: '/precios', label: 'Importar precios (PVP)', roles: ['admin'] },
    ],
  },
  // Prisma: propuestas de precio (nace en la app de campo)
  {
    label: 'Prisma',
    items: [
      { href: '/price-proposals', label: 'Propuestas de precio', roles: ['admin', 'encargado', 'analista'] },
      { href: '/price-export', label: 'Exportar a SAP', roles: ['admin'] },
    ],
  },
  // Mantenimiento (grupo colapsable)
  {
    label: 'Mantenimiento',
    items: [
      { href: '/stores', label: 'Tiendas', roles: ['admin'] },
      { href: '/fixtures', label: 'Muebles', roles: ['admin', 'visual', 'encargado'] },
      { href: '/layout', label: 'Planos', roles: ['admin', 'visual'] },
      { href: '/labels', label: 'Etiquetas', roles: ['admin', 'visual', 'encargado'] },
      { href: '/calendar', label: 'Calendario', roles: ['admin'] },
      { href: '/store-aliases', label: 'Mapeo de tiendas', roles: ['admin'] },
      { href: '/users', label: 'Usuarios', roles: ['admin'] },
      { href: '/users-prisma', label: 'Usuarios Prisma', roles: ['admin'] },
    ],
  },
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
  // Filtra items por rol y descarta secciones que quedan vacías.
  const sections = NAV_SECTIONS.map((s) => ({
    label: s.label,
    items: s.items.filter((n) => n.roles.includes(role)).map(({ href, label }) => ({ href, label })),
  })).filter((s) => s.items.length > 0);

  return (
    <div className="shell">
      <Sidebar sections={sections} name={profile?.full_name ?? user.email ?? ''} role={role} />
      <main className="content">{children}</main>
    </div>
  );
}
