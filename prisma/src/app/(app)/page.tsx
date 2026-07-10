import Link from 'next/link';
import { getCurrentStore } from '@/lib/currentStore';
import Scanner from '@/components/Scanner';

export const dynamic = 'force-dynamic';

export default async function ScanPage() {
  const store = await getCurrentStore();
  return (
    <main className="app">
      <div className="appbar">
        <div>
          <h1>Escanear producto</h1>
          <div className="sub">Código de variante</div>
        </div>
        <Link href="/tienda" className="store-chip">📍 {store?.name ?? 'Tienda'} ▾</Link>
      </div>
      <div className="body">
        <Scanner />
      </div>
    </main>
  );
}
