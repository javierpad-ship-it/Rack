'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
    // La semana comercial la define el servidor (week_calendar): usarla como
    // default para no divergir si el admin ancló la Semana 1 a mano.
    supabase.rpc('current_comm_week').then(({ data }) => {
      if (typeof data === 'string' && data) setWeek(data);
    });
  }, [supabase]);

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
  const tot = useMemo(() => rows.reduce(
    (a, r) => ({ skus: a.skus + (Number(r.skus_count) || 0), units: a.units + (Number(r.units_count) || 0) }),
    { skus: 0, units: 0 },
  ), [rows]);

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
              <td className={r.scanned ? 'pos' : 'neg'}>
                {r.scanned ? '✓ Escaneado' : 'Pendiente'}
              </td>
              <td className="muted">
                {r.scanned_at ? new Date(r.scanned_at).toLocaleString('es-PE') : '—'}
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
        {rows.length > 0 && (
          <tfoot>
            <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
              <td>TOTAL</td>
              <td className={done === rows.length ? 'pos' : undefined}>{done}/{rows.length} ({pct}%)</td>
              <td className="muted">—</td>
              <td>{tot.skus.toLocaleString('es-PE')}</td>
              <td>{tot.units.toLocaleString('es-PE')}</td>
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
