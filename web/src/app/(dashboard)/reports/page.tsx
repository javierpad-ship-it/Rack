'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isoWeek, previousIsoWeek } from '@/lib/week';
import type { Fixture, Store, StoreLayout, WarehouseRow } from '@/lib/types';
import Heatmap from './Heatmap';

interface WoWRow {
  fixture_id: string;
  fixture_name: string;
  units_now: number;
  units_prev: number;
  amount_now: number;
  amount_prev: number;
  delta_units: number;
  delta_pct: number | null;
  exposed_now: number;
  remaining_now: number;
}

interface UnattributedRow {
  sku: string;
  name: string;
  units: number;
  amount: number;
}

export default function ReportsPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  const [rows, setRows] = useState<WoWRow[]>([]);
  const [warehouse, setWarehouse] = useState<WarehouseRow[]>([]);
  const [fixtures, setFixtures] = useState<Fixture[]>([]);
  const [layout, setLayout] = useState<StoreLayout | null>(null);
  const [unattributed, setUnattributed] = useState<UnattributedRow[]>([]);
  const [tab, setTab] = useState<'tabla' | 'heatmap' | 'almacen' | 'sinmueble'>('tabla');

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
    const prev = previousIsoWeek(week);
    const [{ data: wow }, { data: wh }, { data: fx }, { data: lay }, { data: un }] =
      await Promise.all([
        supabase.rpc('fixture_week_over_week', {
          p_store_id: storeId,
          p_week: week,
          p_prev_week: prev,
        }),
        supabase.rpc('store_warehouse', { p_store_id: storeId, p_week: week }),
        supabase.from('fixtures').select('*').eq('store_id', storeId),
        supabase.from('store_layouts').select('*').eq('store_id', storeId).maybeSingle(),
        supabase.rpc('unattributed_sales', { p_store_id: storeId, p_week: week }),
      ]);
    setRows((wow ?? []) as WoWRow[]);
    setWarehouse((wh ?? []) as WarehouseRow[]);
    setFixtures((fx ?? []) as Fixture[]);
    setLayout((lay as StoreLayout) ?? null);
    setUnattributed((un ?? []) as UnattributedRow[]);
  }, [supabase, storeId, week]);

  useEffect(() => {
    load();
  }, [load]);

  const fmt = (n: number) => (Number(n) || 0).toLocaleString('es-PE', { maximumFractionDigits: 0 });

  return (
    <div>
      <h1>Reportes</h1>
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
        <span className="muted">vs {previousIsoWeek(week)}</span>
      </div>

      <div className="row" style={{ marginBottom: 12 }}>
        <button className={tab === 'tabla' ? '' : 'secondary'} onClick={() => setTab('tabla')}>
          Venta por mueble
        </button>
        <button className={tab === 'heatmap' ? '' : 'secondary'} onClick={() => setTab('heatmap')}>
          Heatmap
        </button>
        <button className={tab === 'almacen' ? '' : 'secondary'} onClick={() => setTab('almacen')}>
          Almacén
        </button>
        <button className={tab === 'sinmueble' ? '' : 'secondary'} onClick={() => setTab('sinmueble')}>
          Sin mueble
        </button>
      </div>

      {tab === 'tabla' && (
        <table className="panel">
          <thead>
            <tr>
              <th>Mueble</th>
              <th>Unid. ({week})</th>
              <th>Unid. (prev)</th>
              <th>Δ unid.</th>
              <th>Δ %</th>
              <th>En piso (actual)</th>
              <th>Importe ({week})</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.fixture_id}>
                <td>{r.fixture_name}</td>
                <td>{fmt(r.units_now)}</td>
                <td>{fmt(r.units_prev)}</td>
                <td className={r.delta_units >= 0 ? 'pos' : 'neg'}>
                  {r.delta_units >= 0 ? '+' : ''}
                  {fmt(r.delta_units)}
                </td>
                <td className="muted">{r.delta_pct != null ? `${r.delta_pct}%` : '—'}</td>
                <td title={`Escaneado: ${fmt(r.exposed_now)} · Vendido: ${fmt(r.units_now)}`}>
                  {fmt(r.remaining_now)} u
                </td>
                <td>S/ {fmt(r.amount_now)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={7} className="muted">
                  Sin métricas para esta semana. Importá ventas y asegurate de haber escaneado los muebles.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}

      {tab === 'heatmap' && (
        <Heatmap layout={layout} fixtures={fixtures} metrics={rows} />
      )}

      {tab === 'sinmueble' && (
        <div>
          <p className="muted">
            SKUs vendidos esta semana que no se escanearon en ningún mueble (mueble sin escanear o
            producto fuera de exhibición).
          </p>
          <table className="panel">
            <thead>
              <tr>
                <th>SKU</th>
                <th>Producto</th>
                <th>Unidades</th>
                <th>Importe</th>
              </tr>
            </thead>
            <tbody>
              {unattributed.map((u) => (
                <tr key={u.sku}>
                  <td>{u.sku}</td>
                  <td>{u.name}</td>
                  <td>{fmt(u.units)}</td>
                  <td>S/ {fmt(u.amount)}</td>
                </tr>
              ))}
              {unattributed.length === 0 && (
                <tr>
                  <td colSpan={4} className="muted">
                    Todas las ventas de la semana quedaron atribuidas a un mueble. 🎉
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'almacen' && (
        <table className="panel">
          <thead>
            <tr>
              <th>SKU</th>
              <th>Stock total</th>
              <th>En piso</th>
              <th>En almacén (deducido)</th>
            </tr>
          </thead>
          <tbody>
            {warehouse.map((w) => (
              <tr key={w.sku}>
                <td>{w.sku}</td>
                <td>{fmt(w.total_units)}</td>
                <td>{fmt(w.floor_units)}</td>
                <td>{fmt(w.warehouse_units)}</td>
              </tr>
            ))}
            {warehouse.length === 0 && (
              <tr>
                <td colSpan={4} className="muted">
                  Importá el stock total de la tienda para deducir el almacén.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      )}
    </div>
  );
}
