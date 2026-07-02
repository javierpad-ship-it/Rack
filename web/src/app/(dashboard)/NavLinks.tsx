'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';

type Item = { href: string; label: string };
type Section = { label?: string; items: Item[] };

function isActive(pathname: string, href: string): boolean {
  return href === '/' ? pathname === '/' : pathname.startsWith(href);
}

export default function NavLinks({ sections }: { sections: Section[] }) {
  const pathname = usePathname();
  return (
    <nav>
      {sections.map((s, i) =>
        s.label ? (
          <NavGroup key={s.label} label={s.label} items={s.items} pathname={pathname} />
        ) : (
          <div className="nav-flat" key={`flat-${i}`}>
            {s.items.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={isActive(pathname, n.href) ? 'active' : undefined}
              >
                {n.label}
              </Link>
            ))}
          </div>
        ),
      )}
    </nav>
  );
}

function NavGroup({ label, items, pathname }: { label: string; items: Item[]; pathname: string }) {
  const hasActive = items.some((n) => isActive(pathname, n.href));
  const [open, setOpen] = useState(hasActive);
  return (
    <div className="nav-group">
      <button type="button" className="nav-group-header" onClick={() => setOpen((o) => !o)}>
        <span>{label}</span>
        <span className={`chev${open ? ' open' : ''}`} aria-hidden="true">
          ▾
        </span>
      </button>
      {open && (
        <div className="nav-group-items">
          {items.map((n) => (
            <Link
              key={n.href}
              href={n.href}
              className={isActive(pathname, n.href) ? 'active' : undefined}
            >
              {n.label}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
