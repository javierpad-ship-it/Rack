import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentStore } from '@/lib/currentStore';
import type { PriceInfo } from '@/lib/types';
import ProposeForm from './ProposeForm';

export const dynamic = 'force-dynamic';

export default async function ProponerPage({
  params,
  searchParams,
}: {
  params: { generic: string };
  searchParams: { sku?: string };
}) {
  const generic = decodeURIComponent(params.generic);
  const sku = searchParams.sku ?? null;
  const store = await getCurrentStore();
  const supabase = createClient();
  const { data } = await supabase.rpc('generic_price_info_empresa', {
    p_generic: generic,
    p_empresa: store?.empresa_id ?? null,
  });
  const price = (data as PriceInfo) ?? null;
  const { data: empresa } = store?.empresa_id
    ? await supabase.from('empresas').select('nombre, nombre_reporte').eq('id', store.empresa_id).single()
    : { data: null };
  const empresaNombre = empresa ? (empresa.nombre_reporte ?? empresa.nombre) : null;

  return (
    <main className="app">
      <div className="appbar">
        <Link href={sku ? `/ficha/${encodeURIComponent(sku)}` : '/'} className="back">←</Link>
        <div>
          <h1>Proponer precio</h1>
          <div className="sub">Genérico {generic}</div>
        </div>
      </div>
      <div className="body">
        <ProposeForm
          generic={generic}
          sku={sku}
          currentPvp={price?.pvp_vigente ?? null}
          empresaNombre={empresaNombre}
        />
      </div>
    </main>
  );
}
