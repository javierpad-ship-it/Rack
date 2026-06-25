'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isoWeek, previousIsoWeek } from '@/lib/week';
import type { Store } from '@/lib/types';

interface AlertRow {
  kind: string;
  severity: string;
  ref: string;
  detail: string;
}

const LABEL: Record<string, string> = {
  reposicion: 'Reposición',
  mueble_sin_escanear: 'Mueble sin escanear',
  caida_venta: 'Caída de venta',
};

const SEV_COLOR: Record<string, string> = {
  alta: '#ff6b6b',
  media: '#ffcc00',
  baja: '#9aa0ab',
};

export default function AlertsPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  const [rows, setRows] = useState<AlertRow[]>([]);

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
    const { data } = await supabase.rpc('store_alerts', {
      p_store_id: storeId,
      p_week: week,
      p_prev_week: previousIsoWeek(week),
    });
    setRows((data ?? []) as AlertRow[]);
  }, [supabase, storeId, week]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <h1>Alertas</h1>
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
      </div>

      <table className="panel">
        <thead>
          <tr>
            <th>Tipo</th>
            <th>Severidad</th>
            <th>Referencia</th>
            <th>Detalle</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i}>
              <td>{LABEL[r.kind] ?? r.kind}</td>
              <td style={{ color: SEV_COLOR[r.severity] ?? undefined }}>{r.severity}</td>
              <td>{r.ref}</td>
              <td className="muted">{r.detail}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Sin alertas para esta semana. 🎉
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
