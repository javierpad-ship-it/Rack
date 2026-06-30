'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Fixture, Store } from '@/lib/types';
import Barcode from '@/components/Barcode';

export default function LabelsPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [floor, setFloor] = useState<number | 'all'>('all');
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [format, setFormat] = useState<'zebra' | 'a4'>('zebra');

  const selectedStore = stores.find((s) => s.id === storeId);
  const floorCount = selectedStore?.floors ?? 1;

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
    let q = supabase.from('fixtures').select('*').eq('store_id', storeId).eq('active', true);
    if (floor !== 'all') q = q.eq('floor', floor);
    const { data } = await q.order('floor').order('barcode');
    setFixtures((data ?? []) as Fixture[]);
  }, [supabase, storeId, floor]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div>
      <span className="eyebrow">Impresión</span>
      <h1>Etiquetas de muebles</h1>

      <div className="panel row no-print" style={{ marginBottom: 18 }}>
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
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Piso
          <select
            value={String(floor)}
            onChange={(e) => setFloor(e.target.value === 'all' ? 'all' : Number(e.target.value))}
          >
            <option value="all">Todos</option>
            {Array.from({ length: floorCount }, (_, i) => i + 1).map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Formato
          <select value={format} onChange={(e) => setFormat(e.target.value as 'zebra' | 'a4')}>
            <option value="zebra">Zebra 51×24.5 mm (2 por fila)</option>
            <option value="a4">A4 (hoja)</option>
          </select>
        </label>
        <span className="muted">{fixtures.length} etiqueta(s)</span>
        <button onClick={() => window.print()} disabled={fixtures.length === 0}>
          Imprimir
        </button>
      </div>

      {format === 'zebra' && (
        <style>{`@page { size: 105mm 24.5mm; margin: 0; }`}</style>
      )}

      <p className="muted no-print" style={{ fontSize: 13, marginTop: -6 }}>
        {format === 'zebra' ? (
          <>
            Zebra: en el diálogo de impresión elegí la impresora Zebra, papel/medio{' '}
            <b>51 × 24.5 mm</b> (o 105 × 24.5 si imprime de a 2), <b>escala 100%</b>, márgenes{' '}
            <b>ninguno</b> y desactivá “Encabezados y pies de página”.
          </>
        ) : (
          <>
            A4: desactivá “Encabezados y pies de página” y usá márgenes mínimos. Cada recuadro es una
            etiqueta para recortar.
          </>
        )}
      </p>

      <div className={`sheet ${format}`}>
        {fixtures.map((f) => (
          <div key={f.id} className={`sticker ${format}`}>
            <div className="sticker-top">
              <span className="sticker-brand">
                Rack One <span className="spark">✦</span>
              </span>
              <span className="sticker-store">
                {selectedStore?.name ?? ''} · Piso {f.floor}
              </span>
            </div>
            <div className="sticker-name">{f.name}</div>
            <div className="sticker-barcode">
              <Barcode value={f.barcode} />
            </div>
            <div className="sticker-code">{f.barcode}</div>
          </div>
        ))}
        {fixtures.length === 0 && (
          <p className="muted no-print">No hay muebles activos para esta selección.</p>
        )}
      </div>
    </div>
  );
}
