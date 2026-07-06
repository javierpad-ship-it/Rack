'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { currentMonth } from '@/lib/week';
import type { Store } from '@/lib/types';

interface MonthlyRow {
  fixture_id: string;
  fixture_name: string;
  mtd_units: number;
  mtd_amount: number;
  exposed_units: number;
  total_stock: number;
  projected_units: number;
  projected_amount: number;
  rotation_projected: number | null;
}

export default function MonthlyPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [month, setMonth] = useState(currentMonth());
  const [rows, setRows] = useState<MonthlyRow[]>([]);

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('name')
      .then(({ data }) => {
        const s = (data ?? []) as Store[];
        setStores(s);
        if (s[0]) setStoreId(s[0].id);
      });
  }, [supabase]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase.rpc('fixture_monthly_metrics', {
      p_store_id: storeId,
      p_month: month,
    });
    setRows((data ?? []) as MonthlyRow[]);
  }, [supabase, storeId, month]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number) => (Number(n) || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });

  const tot = useMemo(() => rows.reduce(
    (a, r) => ({
      mtd_units: a.mtd_units + (Number(r.mtd_units) || 0),
      mtd_amount: a.mtd_amount + (Number(r.mtd_amount) || 0),
      projected_units: a.projected_units + (Number(r.projected_units) || 0),
      projected_amount: a.projected_amount + (Number(r.projected_amount) || 0),
      exposed_units: a.exposed_units + (Number(r.exposed_units) || 0),
      total_stock: a.total_stock + (Number(r.total_stock) || 0),
    }),
    { mtd_units: 0, mtd_amount: 0, projected_units: 0, projected_amount: 0, exposed_units: 0, total_stock: 0 },
  ), [rows]);
  // Rotación proyectada global = venta proyectada / stock total.
  const totRot = tot.total_stock > 0 ? tot.projected_units / tot.total_stock : null;

  return (
    <div>
      <h1>Proyección mensual</h1>
      <p className="muted">
        Venta acumulada del mes proyectada a fin de mes (lineal por días corridos). Atribución por
        último mueble escaneado. Rotación proyectada = venta proyectada / stock total (piso + almacén).
      </p>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          Tienda{' '}
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Mes <input type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        </label>
      </div>

      <table className="panel">
        <thead>
          <tr>
            <th>Mueble</th>
            <th>Venta MTD</th>
            <th>Venta proyectada</th>
            <th>Stock expuesto</th>
            <th>Stock total</th>
            <th>Rotación proyectada</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fixture_id}>
              <td>{r.fixture_name}</td>
              <td>
                {fmt(r.mtd_units)} u · S/ {fmt(r.mtd_amount)}
              </td>
              <td style={{ fontWeight: 600 }}>
                {fmt(r.projected_units)} u · S/ {fmt(r.projected_amount)}
              </td>
              <td>{fmt(r.exposed_units)} u</td>
              <td>{fmt(r.total_stock)} u</td>
              <td>{r.rotation_projected != null ? r.rotation_projected.toFixed(2) : '—'}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={6} className="muted">
                Sin datos del mes. Importá ventas y asegurate de haber escaneado los muebles.
              </td>
            </tr>
          )}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
              <td>TOTAL</td>
              <td>{fmt(tot.mtd_units)} u · S/ {fmt(tot.mtd_amount)}</td>
              <td>{fmt(tot.projected_units)} u · S/ {fmt(tot.projected_amount)}</td>
              <td>{fmt(tot.exposed_units)} u</td>
              <td>{fmt(tot.total_stock)} u</td>
              <td>{totRot != null ? totRot.toFixed(2) : '—'}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
