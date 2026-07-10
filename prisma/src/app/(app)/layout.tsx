import { redirect } from 'next/navigation';
import { getCurrentStore } from '@/lib/currentStore';
import { assertPasswordFresh } from '@/lib/requirePasswordFresh';
import TabBar from '@/components/TabBar';

export const dynamic = 'force-dynamic';

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  await assertPasswordFresh();
  const store = await getCurrentStore();
  // Sin tienda seleccionada → primero elegir tienda.
  if (!store) redirect('/tienda');

  return (
    <>
      {children}
      <TabBar />
    </>
  );
}
