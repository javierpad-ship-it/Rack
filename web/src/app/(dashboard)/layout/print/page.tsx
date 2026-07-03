'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Fixture, Store, StoreLayout } from '@/lib/types';

export default function PlanPrintPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [floor, setFloor] = useState(1);
  const [layout, setLayout] = useState<StoreLayout | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);

  const store = stores.find((s) => s.id === storeId);
  const floorCount = store?.floors ?? 1;

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

  // Si cambia la tienda y el piso elegido no existe, volver al piso 1.
  useEffect(() => {
    if (floor > floorCount) setFloor(1);
  }, [floorCount, floor]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const [{ data: lay }, { data: fx }] = await Promise.all([
      supabase
        .from('store_layouts')
        .select('*')
        .eq('store_id', storeId)
        .eq('floor', floor)
        .maybeSingle(),
      supabase.from('fixtures').select('*').eq('store_id', storeId).eq('floor', floor).order('name'),
    ]);
    setLayout((lay as StoreLayout) ?? null);
    setFixtures((fx ?? []) as Fixture[]);
  }, [supabase, storeId, floor]);

  useEffect(() => {
    load();
  }, [load]);

  const placed = fixtures.filter((f) => f.pin_x != null && f.pin_y != null);
  const unplaced = fixtures.filter((f) => f.pin_x == null || f.pin_y == null);

  // Descarga el plano con los pines y nombres "quemados" como JPG a resolución
  // completa de la imagen original (evita el descuadre de la impresión web).
  function downloadJpg() {
    if (!layout?.image_url) return;
    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      const W = img.naturalWidth;
      const H = img.naturalHeight;
      const canvas = document.createElement('canvas');
      canvas.width = W;
      canvas.height = H;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.drawImage(img, 0, 0, W, H);

      const base = Math.max(W, H);
      const dotR = Math.max(6, base * 0.006);
      const fontSize = Math.max(14, base * 0.015);
      ctx.font = `700 ${fontSize}px system-ui, -apple-system, sans-serif`;
      ctx.textBaseline = 'middle';

      const padX = fontSize * 0.5;
      const boxH = fontSize + fontSize * 0.7;
      const r = Math.min(8, boxH / 2);

      placed.forEach((f) => {
        const x = (f.pin_x as number) * W;
        const y = (f.pin_y as number) * H;
        const label = f.name;
        const tw = ctx.measureText(label).width;
        const boxW = tw + padX * 2;

        // Etiqueta a la derecha del punto; si se sale, va a la izquierda.
        let bx = x + dotR + 6;
        if (bx + boxW > W - 4) bx = x - dotR - 6 - boxW;
        const by = y - boxH / 2;

        // caja
        ctx.beginPath();
        if (typeof (ctx as any).roundRect === 'function') {
          (ctx as any).roundRect(bx, by, boxW, boxH, r);
        } else {
          ctx.rect(bx, by, boxW, boxH);
        }
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.lineWidth = Math.max(1, base * 0.0012);
        ctx.strokeStyle = '#CFD8EA';
        ctx.stroke();
        ctx.fillStyle = '#000000';
        ctx.fillText(label, bx + padX, y);

        // punto
        ctx.beginPath();
        ctx.arc(x, y, dotR, 0, Math.PI * 2);
        ctx.fillStyle = '#2B5BE2';
        ctx.fill();
        ctx.lineWidth = Math.max(2, dotR * 0.5);
        ctx.strokeStyle = '#ffffff';
        ctx.stroke();
      });

      try {
        canvas.toBlob(
          (blob) => {
            if (!blob) return;
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `plano-${store?.code ?? 'tienda'}${floorCount > 1 ? `-piso${floor}` : ''}.jpg`;
            a.click();
            URL.revokeObjectURL(url);
          },
          'image/jpeg',
          0.92,
        );
      } catch {
        alert('No se pudo exportar (la imagen del plano bloquea la exportación por CORS).');
      }
    };
    img.onerror = () => alert('No se pudo cargar la imagen del plano para exportar.');
    img.src = layout.image_url;
  }

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
        {floorCount > 1 && (
          <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            Piso
            <select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
              {Array.from({ length: floorCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <button onClick={downloadJpg} disabled={!layout?.image_url}>
          Descargar JPG
        </button>
        <button className="secondary" onClick={() => window.print()} disabled={!layout?.image_url}>
          Imprimir
        </button>
      </div>

      <div className="plan-sheet">
        <div className="plan-head">
          <strong>{store?.name ?? ''}</strong>
          <span className="muted">
            {floorCount > 1 ? ` · Piso ${floor}` : ''} · Plano de muebles · {placed.length} ubicados
          </span>
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
