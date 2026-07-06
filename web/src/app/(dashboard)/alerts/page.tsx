'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
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
  alta: '#C0473B',
  media: '#A9781A',
  baja: '#647084',
};

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];

// Jerarquía fija del drill-down.
const HIER = [
  { level: 'resp', label: 'Responsable' },
  { level: 'mueble', label: 'Mueble (piso de venta)' },
  { level: 'gender', label: 'Género' },
  { level: 'mundo', label: 'Mundo' },
  { level: 'linea', label: 'Línea' },
  { level: 'articulo', label: 'Código genérico' },
  { level: 'talla', label: 'Talla' },
  { level: 'sku', label: 'SKU' },
] as const;

type DrillRow = { key: string; cant: number; val: number; mg: number; stk: number; stk_val: number; irp: number; irp_proy: number; mgn: number };
type DrillTot = Omit<DrillRow, 'key'>;
type DrillData = { next: string; rows: DrillRow[]; tot: DrillTot };

function irpText(irp: number): string {
  if (irp >= 30) return '#2E7D32';
  if (irp >= 20) return '#B26A00';
  return '#C62828';
}
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');

export default function AlertsPage() {
  const supabase = createClient();
  const [tab, setTab] = useState<'drill' | 'ops'>('drill');
  const [stores, setStores] = useState<Store[]>([]);

  useEffect(() => {
    supabase.from('stores').select('*').order('name').then(({ data }) => setStores((data ?? []) as Store[]));
  }, [supabase]);

  return (
    <div>
      <h1>Alertas</h1>
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={tab === 'drill' ? '' : 'secondary'} onClick={() => setTab('drill')}>Drill-down</button>
        <button className={tab === 'ops' ? '' : 'secondary'} onClick={() => setTab('ops')}>Alertas operativas</button>
      </div>
      {tab === 'drill' ? <DrillDown stores={stores} /> : <OpsAlerts stores={stores} />}
    </div>
  );
}

function DrillDown({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const now = new Date();
  const defMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(defYear);
  const [month, setMonth] = useState(defMonth);
  const [storeId, setStoreId] = useState('');
  const [path, setPath] = useState<{ level: string; value: string }[]>([]);
  const [data, setData] = useState<DrillData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Al cambiar período o tienda, reinicia el camino.
  useEffect(() => { setPath([]); }, [year, month, storeId]);

  const period = useMemo(() => {
    const mm = String(month).padStart(2, '0');
    return {
      p_from: `${year}-${mm}-01`,
      p_to: `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
    };
  }, [year, month]);

  const nextLevel = HIER[path.length]?.level ?? null;
  const canDrill = path.length < HIER.length - 1; // en SKU ya no se baja más

  const load = useCallback(async () => {
    if (!nextLevel) return;
    setLoading(true);
    setError(null);
    const byLevel = Object.fromEntries(path.map((p) => [p.level, p.value]));
    const { data: d, error } = await supabase.rpc('alert_drill', {
      ...period,
      p_store: storeId || null,
      p_next: nextLevel,
      p_resp: byLevel['resp'] ?? null,
      p_mueble: byLevel['mueble'] ?? null,
      p_gender: byLevel['gender'] ?? null,
      p_mundo: byLevel['mundo'] ?? null,
      p_linea: byLevel['linea'] ?? null,
      p_articulo: byLevel['articulo'] ?? null,
      p_talla: byLevel['talla'] ?? null,
      p_sku: byLevel['sku'] ?? null,
    });
    if (error) {
      setError(error.message);
      setData(null);
    } else {
      const r = (d ?? {}) as Partial<DrillData>;
      setData({
        next: r.next ?? nextLevel,
        rows: Array.isArray(r.rows) ? r.rows : [],
        tot: r.tot ?? { cant: 0, val: 0, mg: 0, stk: 0, stk_val: 0, irp: 0, irp_proy: 0, mgn: 0 },
      });
    }
    setLoading(false);
  }, [supabase, period, storeId, path, nextLevel]);

  useEffect(() => { load(); }, [load]);

  const levelLabel = HIER[path.length]?.label ?? '';

  return (
    <div>
      <div className="panel row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 12 }}>
        <label>Año<br /><select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[defYear - 1, defYear, defYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select></label>
        <label>Mes<br /><select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select></label>
        <label>Tienda<br /><select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
          <option value="">Todas</option>
          {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
        </select></label>
      </div>

      {/* Breadcrumb del camino */}
      <div className="row" style={{ gap: 6, flexWrap: 'wrap', alignItems: 'center', marginBottom: 10, fontSize: 14 }}>
        <button className="secondary" style={{ padding: '3px 10px' }} onClick={() => setPath([])}>Inicio</button>
        {path.map((p, i) => (
          <span key={i} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
            <span style={{ color: '#7E93C6' }}>›</span>
            <button className="secondary" style={{ padding: '3px 10px' }} onClick={() => setPath(path.slice(0, i + 1))}>
              <span className="muted" style={{ fontSize: 11 }}>{HIER[i].label}: </span>{p.value}
            </button>
          </span>
        ))}
      </div>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && data && (
        <>
          <h2 style={{ marginBottom: 6 }}>Por {levelLabel.toLowerCase()}</h2>
          <table className="panel">
            <thead>
              <tr>
                <th>{levelLabel}</th><th>Ventas (und)</th><th>Monto (S/)</th><th>Stock (und)</th>
                <th>IRP</th><th>IRP proy.</th><th>Margen %</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <tr
                  key={r.key}
                  onClick={canDrill ? () => setPath([...path, { level: nextLevel!, value: r.key }]) : undefined}
                  style={canDrill ? { cursor: 'pointer' } : undefined}
                  title={canDrill ? 'Ver detalle' : undefined}
                >
                  <td>{canDrill ? '▸ ' : ''}{r.key}</td>
                  <td>{fmt(r.cant)}</td><td>{fmt(r.val)}</td><td>{fmt(r.stk)}</td>
                  <td><span style={{ color: irpText(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                  <td><span style={{ color: irpText(r.irp_proy) }}>{r.irp_proy}%</span></td>
                  <td>{r.mgn}%</td>
                </tr>
              ))}
              {data.rows.length === 0 && <tr><td colSpan={7} className="muted">Sin datos para este nivel.</td></tr>}
            </tbody>
            {data.rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                  <td>TOTAL</td><td>{fmt(data.tot.cant)}</td><td>{fmt(data.tot.val)}</td><td>{fmt(data.tot.stk)}</td>
                  <td><span style={{ color: irpText(data.tot.irp) }}>{data.tot.irp}%</span></td>
                  <td><span style={{ color: irpText(data.tot.irp_proy) }}>{data.tot.irp_proy}%</span></td>
                  <td>{data.tot.mgn}%</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="muted" style={{ fontSize: 12 }}>
            {canDrill ? 'Hacé clic en una fila para bajar de nivel.' : 'Nivel de detalle máximo (SKU).'}
            {' '}IRP = Ventas / (Ventas + Stock) × 100. Mueble = última ubicación escaneada del SKU.
          </p>
        </>
      )}
    </div>
  );
}

function OpsAlerts({ stores }: { stores: Store[] }) {
  const supabase = createClient();
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  const [rows, setRows] = useState<AlertRow[]>([]);

  useEffect(() => {
    supabase.rpc('current_comm_week').then(({ data }) => {
      if (typeof data === 'string' && data) setWeek(data);
    });
  }, [supabase]);

  useEffect(() => {
    if (!storeId && stores[0]) setStoreId(stores[0].id);
  }, [stores, storeId]);

  const load = useCallback(async () => {
    if (!storeId) return;
    const { data } = await supabase.rpc('store_alerts', {
      p_store_id: storeId,
      p_week: week,
      p_prev_week: previousIsoWeek(week),
    });
    setRows((data ?? []) as AlertRow[]);
  }, [supabase, storeId, week]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div className="row" style={{ marginBottom: 12 }}>
        <label>
          Tienda{' '}
          <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
            {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
          </select>
        </label>
        <label>Semana <input value={week} onChange={(e) => setWeek(e.target.value)} /></label>
      </div>
      <table className="panel">
        <thead>
          <tr><th>Tipo</th><th>Severidad</th><th>Referencia</th><th>Detalle</th></tr>
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
          {rows.length === 0 && <tr><td colSpan={4} className="muted">Sin alertas para esta semana. 🎉</td></tr>}
        </tbody>
      </table>
    </div>
  );
}
