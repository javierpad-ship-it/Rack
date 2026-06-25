'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isoWeek } from '@/lib/week';
import type { Store } from '@/lib/types';

interface CoverageRow {
  fixture_id: string;
  fixture_name: string;
  scanned: boolean;
  scanned_at: string | null;
  skus_count: number;
  units_count: number;
}

export default function CoveragePage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  const [rows, setRows] = useState<CoverageRow[]>([]);

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
    const { data } = await supabase.rpc('scan_coverage', { p_store_id: storeId, p_week: week });
    setRows((data ?? []) as CoverageRow[]);
  }, [supabase, storeId, week]);

  useEffect(() => {
    load();
  }, [load]);

  const done = rows.filter((r) => r.scanned).length;
  const pct = rows.length ? Math.round((done / rows.length) * 100) : 0;

  return (
    <div>
      <h1>Cobertura de escaneo</h1>
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
          Semana <input value={week} onChange={(e) => setWeek(e.target.value)} />
        </label>
        <span className="panel" style={{ padding: '6px 12px' }}>
          {done}/{rows.length} muebles ({pct}%)
        </span>
      </div>

      <table className="panel">
        <thead>
          <tr>
            <th>Mueble</th>
            <th>Estado</th>
            <th>Escaneado</th>
            <th>SKUs</th>
            <th>Unidades</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.fixture_id}>
              <td>{r.fixture_name}</td>
              <td style={{ color: r.scanned ? '#6bdc7a' : '#ff6b6b' }}>
                {r.scanned ? '✓ Escaneado' : 'Pendiente'}
              </td>
              <td className="muted">
                {r.scanned_at ? new Date(r.scanned_at).toLocaleString('es-AR') : '—'}
              </td>
              <td>{r.skus_count}</td>
              <td>{r.units_count}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={5} className="muted">
                Sin muebles activos en esta tienda.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
