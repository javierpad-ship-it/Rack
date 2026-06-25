'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';

interface TrendRow {
  fixture_id: string;
  fixture_name: string;
  week: string;
  units_sold: number;
  amount_sold: number;
  rotation: number | null;
}

export default function TrendsPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [rows, setRows] = useState<TrendRow[]>([]);

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
    const { data } = await supabase.rpc('fixture_trends', { p_store_id: storeId, p_weeks: 8 });
    setRows((data ?? []) as TrendRow[]);
  }, [supabase, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  // Pivot: filas = muebles, columnas = semanas (importe de venta).
  const weeks = [...new Set(rows.map((r) => r.week))].sort();
  const byFixture = new Map<string, { name: string; cells: Map<string, number> }>();
  rows.forEach((r) => {
    if (!byFixture.has(r.fixture_id)) {
      byFixture.set(r.fixture_id, { name: r.fixture_name, cells: new Map() });
    }
    byFixture.get(r.fixture_id)!.cells.set(r.week, r.amount_sold);
  });
  const max = Math.max(1, ...rows.map((r) => r.amount_sold));
  const fmt = (n: number) => n.toLocaleString('es-AR', { maximumFractionDigits: 0 });

  return (
    <div>
      <h1>Tendencias</h1>
      <p className="muted">Venta por mueble en las últimas {weeks.length} semanas registradas.</p>
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
      </div>

      <table className="panel">
        <thead>
          <tr>
            <th>Mueble</th>
            {weeks.map((w) => (
              <th key={w}>{w}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...byFixture.entries()].map(([id, f]) => (
            <tr key={id}>
              <td>{f.name}</td>
              {weeks.map((w) => {
                const v = f.cells.get(w) ?? 0;
                const t = Math.min(1, v / max);
                return (
                  <td
                    key={w}
                    title={`$${fmt(v)}`}
                    style={{ background: `rgba(79,140,255,${t.toFixed(2)})` }}
                  >
                    {fmt(v)}
                  </td>
                );
              })}
            </tr>
          ))}
          {byFixture.size === 0 && (
            <tr>
              <td className="muted">Sin métricas. Importá ventas de varias semanas.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
