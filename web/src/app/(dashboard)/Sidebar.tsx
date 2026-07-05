'use client';

import { useEffect, useState } from 'react';
import { usePathname } from 'next/navigation';
import NavLinks from './NavLinks';
import SignOutButton from './SignOutButton';
import BrandLogo from '@/components/BrandLogo';

type Section = { label?: string; items: { href: string; label: string }[] };

// Sidebar responsivo: en escritorio es la columna fija; en móvil se colapsa
// detrás de un botón hamburguesa (drawer con overlay).
export default function Sidebar({
  sections,
  name,
  role,
}: {
  sections: Section[];
  name: string;
  role: string;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  // Al navegar (móvil), cierra el menú.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  return (
    <>
      {/* Barra superior con hamburguesa: solo visible en móvil (CSS). */}
      <div className="mobile-topbar">
        <button className="hamb" aria-label="Abrir menú" onClick={() => setOpen(true)}>
          ☰
        </button>
        <BrandLogo variant="sidebar" />
      </div>

      {open && <div className="side-overlay" onClick={() => setOpen(false)} />}

      <aside className={`side${open ? ' open' : ''}`}>
        <div className="brand">
          <BrandLogo variant="sidebar" />
          <span className="brand-by">Lukers</span>
        </div>
        <NavLinks sections={sections} />
        <div className="who">
          <div className="name">{name}</div>
          <span className="role-badge">{role}</span>
          <div style={{ marginTop: 12 }}>
            <SignOutButton />
          </div>
        </div>
      </aside>
    </>
  );
}
