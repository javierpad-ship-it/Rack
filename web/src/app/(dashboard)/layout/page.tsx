'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import type { Fixture, Store, StoreLayout } from '@/lib/types';

const BUCKET = 'layouts';

export default function LayoutPlanPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [floor, setFloor] = useState(1);
  const [layout, setLayout] = useState<StoreLayout | null>(null);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [selected, setSelected] = useState<string>('');
  const [status, setStatus] = useState<string | null>(null);
  const imgRef = useRef<HTMLImageElement>(null);

  const selectedStore = stores.find((s) => s.id === storeId);
  const floorCount = selectedStore?.floors ?? 1;
  // Muebles del piso elegido (los pines y la lista solo muestran este piso).
  const floorFixtures = fixtures.filter((f) => f.floor === floor);

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
      supabase.from('fixtures').select('*').eq('store_id', storeId).order('name'),
    ]);
    setLayout((lay as StoreLayout) ?? null);
    setFixtures((fx ?? []) as Fixture[]);
  }, [supabase, storeId, floor]);

  useEffect(() => {
    load();
  }, [load]);

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file || !storeId) return;
    setStatus('Subiendo plano…');
    const path = `${storeId}/piso-${floor}-${Date.now()}.${file.name.split('.').pop()}`;
    const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, file, { upsert: true });
    if (upErr) {
      setStatus(`Error al subir: ${upErr.message}`);
      return;
    }
    const { data: pub } = supabase.storage.from(BUCKET).getPublicUrl(path);
    const { error } = await supabase
      .from('store_layouts')
      .upsert({ store_id: storeId, floor, image_url: pub.publicUrl }, { onConflict: 'store_id,floor' });
    setStatus(error ? `Error: ${error.message}` : 'Plano actualizado.');
    load();
    e.target.value = '';
  }

  // Click sobre la imagen => coordenadas normalizadas [0..1] para el mueble seleccionado.
  async function onImageClick(e: React.MouseEvent<HTMLImageElement>) {
    if (!selected || !imgRef.current) {
      setStatus('Elegí primero un mueble para ubicar.');
      return;
    }
    const rect = imgRef.current.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    const { error } = await supabase
      .from('fixtures')
      .update({ pin_x: Number(x.toFixed(4)), pin_y: Number(y.toFixed(4)) })
      .eq('id', selected);
    setStatus(error ? `Error: ${error.message}` : 'Pin ubicado.');
    load();
  }

  return (
    <div>
      <h1>Plano de tienda</h1>
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
        {floorCount > 1 && (
          <label>
            Piso{' '}
            <select value={floor} onChange={(e) => setFloor(Number(e.target.value))}>
              {Array.from({ length: floorCount }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </label>
        )}
        <label>
          Subir plano <input type="file" accept="image/*" onChange={onUpload} />
        </label>
        <Link href="/layout/print">
          <button type="button" className="secondary">Imprimir con nombres</button>
        </Link>
        {status && <span className="muted">{status}</span>}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '240px 1fr', gap: 16 }}>
        <div className="panel">
          <strong>Muebles</strong>
          <p className="muted" style={{ fontSize: 12 }}>
            {floorCount > 1 ? `Piso ${floor}. ` : ''}Elegí uno y hacé clic en el plano para ubicarlo.
          </p>
          <div style={{ display: 'grid', gap: 4, maxHeight: '70vh', overflowY: 'auto', paddingRight: 4 }}>
            {floorFixtures.map((f) => (
              <button
                key={f.id}
                className={selected === f.id ? '' : 'secondary'}
                onClick={() => setSelected(f.id)}
                style={{ textAlign: 'left' }}
              >
                {f.name} {f.pin_x != null ? '📍' : ''}
              </button>
            ))}
            {floorFixtures.length === 0 && <span className="muted">Sin muebles en este piso.</span>}
          </div>
        </div>

        <div className="panel" style={{ position: 'relative' }}>
          {layout?.image_url ? (
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <img
                ref={imgRef}
                src={layout.image_url}
                alt="Plano"
                onClick={onImageClick}
                style={{ maxWidth: '100%', cursor: 'crosshair', display: 'block' }}
              />
              {floorFixtures
                .filter((f) => f.pin_x != null && f.pin_y != null)
                .map((f) => (
                  <span
                    key={f.id}
                    title={f.name}
                    style={{
                      position: 'absolute',
                      left: `${(f.pin_x as number) * 100}%`,
                      top: `${(f.pin_y as number) * 100}%`,
                      transform: 'translate(-50%, -50%)',
                      width: 14,
                      height: 14,
                      borderRadius: '50%',
                      background: selected === f.id ? '#ffcc00' : '#4f8cff',
                      border: '2px solid #fff',
                    }}
                  />
                ))}
            </div>
          ) : (
            <p className="muted">Subí una imagen del plano para empezar a ubicar muebles.</p>
          )}
        </div>
      </div>
    </div>
  );
}
