import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentStore } from '@/lib/currentStore';
import type { PriceInfo } from '@/lib/types';
import ProposeForm from './ProposeForm';

export const dynamic = 'force-dynamic';

// Con IRP de cadena > 20% la rotación ya es correcta: no tiene sentido tocar
// el precio. Mismo umbral que el semáforo de rotación de la ficha.
const IRP_ROTACION_CORRECTA = 20;

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

  const { data: rotData } = await supabase.rpc('generic_rotation', {
    p_generic: generic,
    p_store_id: store!.id,
  });
  const rot = (rotData as { cadena: number; tienda: number } | null) ?? { cadena: 0, tienda: 0 };
  const rotacionOk = rot.cadena > IRP_ROTACION_CORRECTA;

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
        <div className="card tint">
          <div className="row"><span className="muted">Rotación en esta tienda</span><b className="tnum">{rot.tienda}%</b></div>
          <div className="row"><span className="muted">Rotación en cadena</span><b className="tnum">{rot.cadena}%</b></div>
        </div>

        {rotacionOk ? (
          <div className="card" style={{ background: '#DFF3E1', color: '#14421c' }}>
            <div className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>Rotación correcta</div>
            <p className="mini" style={{ color: 'inherit' }}>
              Este genérico rota bien en cadena ({rot.cadena}%, sobre el {IRP_ROTACION_CORRECTA}%) —
              no se permite proponer un cambio de precio.
            </p>
            <Link className="btn ghost" href={sku ? `/ficha/${encodeURIComponent(sku)}` : '/'}>Volver</Link>
          </div>
        ) : (
          <ProposeForm
            generic={generic}
            sku={sku}
            currentPvp={price?.pvp_vigente ?? null}
            empresaNombre={empresaNombre}
          />
        )}
      </div>
    </main>
  );
}
