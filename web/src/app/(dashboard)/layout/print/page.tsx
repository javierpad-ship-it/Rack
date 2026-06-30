'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Fixture, Store, StoreLayout } from '@/lib/types';

export default function PlanPrintPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [layout, setLayout] = useState<StoreLayout | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  const store = stores.find((s) => s.id === storeId);

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
    const [{ data: lay }, { data: fx }] = await Promise.all([
      supabase.from('store_layouts').select('*').eq('store_id', storeId).maybeSingle(),
      supabase.from('fixtures').select('*').eq('store_id', storeId).order('name'),
    ]);
    setLayout((lay as StoreLayout) ?? null);
    setFixtures((fx ?? []) as Fixture[]);
  }, [supabase, storeId]);

  useEffect(() => {
    load();
  }, [load]);

  const placed = fixtures.filter((f) => f.pin_x != null && f.pin_y != null);
  const unplaced = fixtures.filter((f) => f.pin_x == null || f.pin_y == null);

  return (
    <div>
      <div className="row no-print" style={{ marginBottom: 14 }}>
        <span className="eyebrow">Impresión</span>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Tienda
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </select>
        </label>
        <button onClick={() => window.print()} disabled={!layout?.image_url}>
          Imprimir plano
        </button>
      </div>

      <div className="plan-sheet">
        <div className="plan-head">
          <strong>{store?.name ?? ''}</strong>
          <span className="muted"> · Plano de muebles · {placed.length} ubicados</span>
        </div>

        {layout?.image_url ? (
          <div className="plan-wrap">
            <img src={layout.image_url} alt={`Plano ${store?.name ?? ''}`} className="plan-img" />
            {placed.map((f) => (
              <span
                key={f.id}
                className="plan-pin"
                style={{ left: `${(f.pin_x as number) * 100}%`, top: `${(f.pin_y as number) * 100}%` }}
              >
                <span className="plan-dot" />
                <span className="plan-label">{f.name}</span>
              </span>
            ))}
          </div>
        ) : (
          <p className="muted no-print">
            Esta tienda no tiene plano cargado. Subí uno en la sección “Plano”.
          </p>
        )}

        {unplaced.length > 0 && (
          <p className="muted plan-note" style={{ fontSize: 12, marginTop: 10 }}>
            Sin ubicar en el plano: {unplaced.map((f) => f.name).join(', ')}.
          </p>
        )}
      </div>
    </div>
  );
}
