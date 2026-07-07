import { NextRequest } from 'next/server';
import * as XLSX from 'xlsx';
import { createAdminClient } from '@/lib/supabase/admin';
import { commWeek } from '@/lib/week';

// Endpoint del export nocturno de piso de venta (lo consume Power Automate).
// Devuelve un .xlsx (columnas de verdad) con el detalle de TODAS las tiendas de
// la semana comercial en curso. Protegido por token (EXPORT_TOKEN).
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type Row = {
  tienda: string; tienda_archivo: string; mueble: string; sku: string;
  descripcion: string | null; talla: string | null; color: string | null;
  genero: string | null; responsable: string | null; unidades: number;
};

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get('token');
  const expected = process.env.EXPORT_TOKEN;
  if (!expected || token !== expected) {
    return new Response('No autorizado', { status: 401 });
  }

  const week = req.nextUrl.searchParams.get('week') || commWeek();
  const admin = createAdminClient();
  const { data, error } = await admin.rpc('floor_detail_all', { p_week: week });
  if (error) return new Response(`Error: ${error.message}`, { status: 500 });
  const rows = (data ?? []) as Row[];

  const header = [
    'Tienda (Rack One)', 'Tienda (archivo)', 'Mueble', 'SKU', 'Descripción',
    'Talla', 'Color', 'Género', 'Responsable', 'Unidades en piso',
  ];
  const aoa: (string | number)[][] = [
    header,
    ...rows.map((r) => [
      r.tienda ?? '', r.tienda_archivo ?? '', r.mueble ?? '', r.sku ?? '',
      r.descripcion ?? '', r.talla ?? '', r.color ?? '', r.genero ?? '',
      r.responsable ?? '', Number(r.unidades) || 0,
    ]),
  ];
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  ws['!cols'] = [
    { wch: 18 }, { wch: 22 }, { wch: 22 }, { wch: 16 }, { wch: 40 },
    { wch: 8 }, { wch: 12 }, { wch: 10 }, { wch: 16 }, { wch: 14 },
  ];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Piso de venta');
  const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' }) as Buffer;

  const filename = `piso_de_venta_${week}.xlsx`;
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${filename}"`,
      'Cache-Control': 'no-store',
    },
  });
}
