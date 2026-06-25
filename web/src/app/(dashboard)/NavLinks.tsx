'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function NavLinks({ items }: { items: { href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav>
      {items.map((n) => {
        const active = n.href === '/' ? pathname === '/' : pathname.startsWith(n.href);
        return (
          <Link key={n.href} href={n.href} className={active ? 'active' : undefined}>
            {n.label}
          </Link>
        );
      })}
    </nav>
  );
}
