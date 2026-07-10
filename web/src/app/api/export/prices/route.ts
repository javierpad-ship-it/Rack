import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

// Descarga el .xlsx de un lote de export de precios, con la estructura del
// archivo de carga SAP: Material(Genérico) + Org.Ventas + Canal + validez +
// determinación de precio + lista + selección + Precio Vta.Público.
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const exportId = req.nextUrl.searchParams.get('id');
  if (!exportId) return new Response('Falta id', { status: 400 });

  const session = createClient();
  const { data: { user } } = await session.auth.getUser();
  if (!user) return new Response('No autenticado', { status: 401 });
  const { data: profile } = await session.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin' && profile?.role !== 'analista')
    return new Response('Requiere rol admin o analista', { status: 403 });

  const admin = createAdminClient();
  const { data: exp, error: eErr } = await admin
    .from('price_change_exports')
    .select('id, valid_from')
    .eq('id', exportId)
    .single();
  if (eErr || !exp) return new Response('Lote no encontrado', { status: 404 });

  const { data: items, error: iErr } = await admin
    .from('price_change_export_items')
    .select('generic_code, sales_org, pvp')
    .eq('export_id', exportId)
    .order('generic_code');
  if (iErr) return new Response(`Error: ${iErr.message}`, { status: 500 });

  const header = [
    'Material (Generico)', 'Org. Ventas', 'Canal Distrib.', 'Inicio Validez', 'Fin Validez',
    'Deter. Prec.Compra', 'Deter. Prec.Venta', 'Lista Variante', 'Selección', 'Precio Vta.Público',
  ];
  const validFrom = exp.valid_from as string;
  const aoa: (string | number)[][] = [
    header,
    ...(items ?? []).map((r) => [
      String(r.generic_code), String(r.sales_org), '10', validFrom, '31.12.9999',
      'Z1', 'Z1', 'Z1', 'True', Number(r.pvp),
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 20 }, { wch: 10 }, { wch: 12 }, { wch: 14 }, { wch: 14 },
    { wch: 16 }, { wch: 16 }, { wch: 14 }, { wch: 10 }, { wch: 16 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Precios');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="precios_sap_${validFrom}.xlsx"`,
      'Cache-Control': 'no-store',
    },
  });
}
