'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function TabBar() {
  const path = usePathname();
  const on = (p: string) => (p === '/' ? path === '/' : path.startsWith(p));
  return (
    <nav className="tabbar">
      <Link href="/" className={on('/') ? 'on' : ''}>
        <span className="ic">⚃</span>Escanear
      </Link>
      <Link href="/propuestas" className={on('/propuestas') ? 'on' : ''}>
        <span className="ic">✎</span>Mis propuestas
      </Link>
      <Link href="/tienda" className={on('/tienda') ? 'on' : ''}>
        <span className="ic">📍</span>Tienda
      </Link>
    </nav>
  );
}
