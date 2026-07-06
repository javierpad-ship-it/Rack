'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PRICE_BANDS = ['<9', '9-10', '10-20', '20-30', '30-40', '40-50', '50-70', '70+'];
const IRP_META = 30;

const GROUPS: { value: string; label: string }[] = [
  { value: 'resp', label: 'Responsable' },
  { value: 'linea', label: 'Línea' },
  { value: 'brand', label: 'Marca' },
  { value: 'mundo', label: 'Mundo' },
  { value: 'gender', label: 'Género' },
];

type Filters = { resp: string[]; gender: string[]; mundo: string[]; embarque: string[]; brand: string[]; linea: string[] };
type GroupRow = { grp: string; cant: number; val: number; mg: number; stk: number; stk_val: number; irp: number; irp_proy: number; mgn: number };
type StoreRow = { store: string; cant: number; val: number; mg: number; stk: number; stk_val: number; irp: number; irp_proy: number; mgn: number };
type HmCell = { grp: string; band?: string; talla?: string; irp: number; cant: number; stk?: number };
type Report = {
  snap: string | null; complete: boolean; days_total: number; days_elapsed: number; group_by: string;
  kpis: { cant: number; val: number; mg: number; stk: number; stk_val: number; irp: number; mgn: number; proy_cant: number; irp_proy: number };
  rows: GroupRow[]; price_hm: HmCell[]; talla_hm: HmCell[];
};

// Semáforo de IRP: >=30 verde (claro; más alto = más fuerte), 20-30 naranja
// claro, <20 rojo. Fondo + color de texto con contraste.
function irpCell(irp: number): { bg: string; fg: string } {
  if (irp >= 40) return { bg: '#2E9E44', fg: '#fff' };
  if (irp >= 30) return { bg: '#8FD694', fg: '#14421c' };
  if (irp >= 20) return { bg: '#FFCC80', fg: '#5a3600' };
  if (irp >= 10) return { bg: '#EF5350', fg: '#fff' };
  return { bg: '#B71C1C', fg: '#fff' };
}

// Color de texto (sobre fondo blanco) para tablas y KPIs.
function irpText(irp: number): string {
  if (irp >= 30) return '#2E7D32';
  if (irp >= 20) return '#B26A00';
  return '#C62828';
}
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');

export default function RotationPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [opts, setOpts] = useState<Filters>({ resp: [], gender: [], mundo: [], embarque: [], brand: [], linea: [] });

  const now = new Date();
  const defMonth = now.getMonth() === 0 ? 12 : now.getMonth();
  const defYear = now.getMonth() === 0 ? now.getFullYear() - 1 : now.getFullYear();
  const [year, setYear] = useState(defYear);
  const [month, setMonth] = useState(defMonth);
  const [groupBy, setGroupBy] = useState('resp');
  const [storeId, setStoreId] = useState('');
  const [resp, setResp] = useState('');
  const [gender, setGender] = useState('');
  const [mundo, setMundo] = useState('');
  const [embarque, setEmbarque] = useState('');
  const [brand, setBrand] = useState('');
  const [linea, setLinea] = useState('');

  const [tab, setTab] = useState<'resumen' | 'stores'>('resumen');
  const [report, setReport] = useState<Report | null>(null);
  const [storeRows, setStoreRows] = useState<StoreRow[]>([]);
  const [storePriceHm, setStorePriceHm] = useState<HmCell[]>([]);
  const [storeTallaHm, setStoreTallaHm] = useState<HmCell[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    supabase.from('stores').select('*').order('name').then(({ data }) => setStores((data ?? []) as Store[]));
    supabase.rpc('rotation_filters').then(({ data }) => {
      const d = (data ?? {}) as Partial<Filters>;
      setOpts({
        resp: d.resp ?? [], gender: d.gender ?? [], mundo: d.mundo ?? [],
        embarque: d.embarque ?? [], brand: d.brand ?? [], linea: d.linea ?? [],
      });
    });
  }, [supabase]);

  // Rango y filtros comunes del período elegido.
  const period = useMemo(() => {
    const mm = String(month).padStart(2, '0');
    return {
      p_from: `${year}-${mm}-01`,
      p_to: `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`,
      p_gender: gender || null, p_mundo: mundo || null, p_embarque: embarque || null,
      p_brand: brand || null, p_linea: linea || null, p_resp: resp || null,
    };
  }, [year, month, gender, mundo, embarque, brand, linea, resp]);

  // Carga perezosa por pestaña: solo se consulta lo que está visible, así el
  // servidor no corre las dos consultas pesadas en cada cambio de filtro.
  const loadResumen = useCallback(async () => {
    setLoading(true);
    setError(null);
    const rep = await supabase.rpc('rotation_report', {
      ...period, p_group_by: groupBy, p_store: storeId || null,
    });
    if (rep.error) {
      setError(rep.error.message);
      setReport(null);
    } else {
      const d = (rep.data ?? {}) as Partial<Report>;
      setReport({
        snap: d.snap ?? null, complete: d.complete ?? true,
        days_total: d.days_total ?? 0, days_elapsed: d.days_elapsed ?? 0, group_by: d.group_by ?? groupBy,
        kpis: d.kpis ?? { cant: 0, val: 0, mg: 0, stk: 0, stk_val: 0, irp: 0, mgn: 0, proy_cant: 0, irp_proy: 0 },
        rows: Array.isArray(d.rows) ? d.rows : [],
        price_hm: Array.isArray(d.price_hm) ? d.price_hm : [],
        talla_hm: Array.isArray(d.talla_hm) ? d.talla_hm : [],
      });
    }
    setLoading(false);
  }, [supabase, period, groupBy, storeId]);

  const loadStores = useCallback(async () => {
    setLoading(true);
    setError(null);
    const sto = await supabase.rpc('rotation_stores', period);
    if (sto.error) {
      setError(sto.error.message);
      setStoreRows([]);
      setStorePriceHm([]);
      setStoreTallaHm([]);
    } else {
      const d = (sto.data ?? {}) as { rows?: StoreRow[]; price_hm?: HmCell[]; talla_hm?: HmCell[] };
      setStoreRows(Array.isArray(d.rows) ? d.rows : []);
      setStorePriceHm(Array.isArray(d.price_hm) ? d.price_hm : []);
      setStoreTallaHm(Array.isArray(d.talla_hm) ? d.talla_hm : []);
    }
    setLoading(false);
  }, [supabase, period]);

  useEffect(() => {
    if (tab === 'resumen') loadResumen();
    else loadStores();
  }, [tab, loadResumen, loadStores]);

  const groups = useMemo(() => (report?.rows ?? []).map((r) => r.grp), [report]);
  const priceMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of report?.price_hm ?? []) m.set(`${c.grp}|${c.band}`, c);
    return m;
  }, [report]);
  const tallas = useMemo(() => {
    // Ordena por volumen (ventas + stock) y limita a 20 columnas para que el
    // mapa sea legible (había ~40 tallas en orden alfabético).
    const vol = new Map<string, number>();
    for (const c of report?.talla_hm ?? []) {
      const t = c.talla ?? '';
      vol.set(t, (vol.get(t) ?? 0) + (Number(c.cant) || 0) + (Number(c.stk) || 0));
    }
    return [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  }, [report]);
  const tallaMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of report?.talla_hm ?? []) m.set(`${c.grp}|${c.talla}`, c);
    return m;
  }, [report]);

  // Matrices por tienda (pestaña "Por tienda"): filas = tiendas, columnas =
  // rangos de precio / tallas. Reusan el mismo componente Heatmap (grp = tienda).
  const storeNames = useMemo(() => storeRows.map((r) => r.store), [storeRows]);
  const storePriceMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of storePriceHm) m.set(`${c.grp}|${c.band}`, c);
    return m;
  }, [storePriceHm]);
  const storeTallas = useMemo(() => {
    const vol = new Map<string, number>();
    for (const c of storeTallaHm) {
      const t = c.talla ?? '';
      vol.set(t, (vol.get(t) ?? 0) + (Number(c.cant) || 0) + (Number(c.stk) || 0));
    }
    return [...vol.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20).map(([t]) => t);
  }, [storeTallaHm]);
  const storeTallaMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of storeTallaHm) m.set(`${c.grp}|${c.talla}`, c);
    return m;
  }, [storeTallaHm]);

  // Totalizador de la tabla por tienda (suma de columnas; IRP/Margen recalculados
  // sobre los agregados, no promediados).
  const storeTotals = useMemo(() => {
    const t = storeRows.reduce(
      (a, r) => ({
        cant: a.cant + r.cant, val: a.val + r.val, mg: a.mg + r.mg,
        stk: a.stk + r.stk, stk_val: a.stk_val + r.stk_val,
      }),
      { cant: 0, val: 0, mg: 0, stk: 0, stk_val: 0 },
    );
    const irp = t.cant + t.stk > 0 ? Math.round((t.cant / (t.cant + t.stk)) * 1000) / 10 : 0;
    const mgn = t.val > 0 ? Math.round((t.mg / t.val) * 1000) / 10 : 0;
    return { ...t, irp, mgn };
  }, [storeRows]);

  const k = report?.kpis;
  const grpLabel = GROUPS.find((g) => g.value === groupBy)?.label ?? 'Grupo';

  return (
    <div>
      <h1>Rotación (IRP)</h1>
      <p className="muted" style={{ marginTop: 0 }}>IRP = Ventas (und) / (Ventas + Stock final) × 100. Meta {IRP_META}%.</p>

      <div className="panel row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label>Año<br /><select value={year} onChange={(e) => setYear(Number(e.target.value))}>
          {[defYear - 1, defYear, defYear + 1].map((y) => <option key={y} value={y}>{y}</option>)}
        </select></label>
        <label>Mes<br /><select value={month} onChange={(e) => setMonth(Number(e.target.value))}>
          {MESES.map((m, i) => <option key={i} value={i + 1}>{m}</option>)}
        </select></label>
        <FilterSelect label="Responsable" value={resp} set={setResp} options={opts.resp} />
        <FilterSelect label="Género" value={gender} set={setGender} options={opts.gender} />
        <FilterSelect label="Mundo" value={mundo} set={setMundo} options={opts.mundo} />
        <FilterSelect label="Embarque" value={embarque} set={setEmbarque} options={opts.embarque} />
        <FilterSelect label="Marca" value={brand} set={setBrand} options={opts.brand} />
        <FilterSelect label="Línea" value={linea} set={setLinea} options={opts.linea} />
      </div>

      {/* Pestañas */}
      <div className="row" style={{ gap: 8, marginBottom: 12 }}>
        <button className={tab === 'resumen' ? '' : 'secondary'} onClick={() => setTab('resumen')}>Resumen</button>
        <button className={tab === 'stores' ? '' : 'secondary'} onClick={() => setTab('stores')}>Por tienda</button>
      </div>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && tab === 'resumen' && k && (
        <>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 8, alignItems: 'flex-end' }}>
            <label>Agrupar por<br /><select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
              {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
            </select></label>
            <label>Tienda<br /><select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              <option value="">Todas</option>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select></label>
          </div>

          <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="IRP global" value={`${k.irp}%`} color={irpText(k.irp)} />
            <Kpi label="Margen %" value={`${k.mgn}%`} />
            {!report?.complete && <Kpi label="IRP proyectado" value={`${k.irp_proy}%`} color={irpText(k.irp_proy)} />}
            <Kpi label="Monto total ventas" value={`S/ ${fmt(k.val)}`} />
            <Kpi label="Unidades vendidas" value={fmt(k.cant)} />
            <Kpi label="Stock final (und)" value={fmt(k.stk)} />
            <Kpi label="Valor stock" value={`S/ ${fmt(k.stk_val)}`} />
          </div>
          <p className="muted" style={{ fontSize: 12, marginTop: -4 }}>
            {report?.complete
              ? `Mes completo. Stock final al ${report?.snap ?? '—'}.`
              : `Período incompleto (${report?.days_elapsed}/${report?.days_total} días). IRP proyectado por regla de 3. Stock final al ${report?.snap ?? '—'}.`}
          </p>

          <h2 style={{ marginBottom: 6 }}>Por {grpLabel.toLowerCase()}</h2>
          <table className="panel">
            <thead>
              <tr>
                <th>{grpLabel}</th><th>Ventas (und)</th><th>Monto (S/)</th><th>Stock (und)</th>
                <th>Stk Val (S/)</th><th>IRP</th><th>Margen %</th>{!report?.complete && <th>IRP proy.</th>}
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((r) => (
                <tr key={r.grp}>
                  <td>{r.grp}</td><td>{fmt(r.cant)}</td><td>{fmt(r.val)}</td><td>{fmt(r.stk)}</td><td>{fmt(r.stk_val)}</td>
                  <td><span style={{ color: irpText(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                  <td>{r.mgn}%</td>
                  {!report?.complete && <td><span style={{ color: irpText(r.irp_proy) }}>{r.irp_proy}%</span></td>}
                </tr>
              ))}
              {(report?.rows ?? []).length === 0 && <tr><td colSpan={7} className="muted">Sin datos para el filtro.</td></tr>}
            </tbody>
            {(report?.rows ?? []).length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                  <td>TOTAL</td><td>{fmt(k.cant)}</td><td>{fmt(k.val)}</td><td>{fmt(k.stk)}</td><td>{fmt(k.stk_val)}</td>
                  <td><span style={{ color: irpText(k.irp) }}>{k.irp}%</span></td>
                  <td>{k.mgn}%</td>
                  {!report?.complete && <td><span style={{ color: irpText(k.irp_proy) }}>{k.irp_proy}%</span></td>}
                </tr>
              </tfoot>
            )}
          </table>

          <Heatmap title={`IRP por rango de precio de venta (por ${grpLabel.toLowerCase()})`} rows={groups} cols={PRICE_BANDS} cell={(g, c) => priceMap.get(`${g}|${c}`)} />
          <Heatmap title={`IRP por talla (por ${grpLabel.toLowerCase()})`} rows={groups} cols={tallas} cell={(g, c) => tallaMap.get(`${g}|${c}`)} />
        </>
      )}

      {!loading && tab === 'stores' && (
        <>
          <h2 style={{ marginBottom: 6 }}>Rotación por tienda</h2>
          <table className="panel">
            <thead>
              <tr><th>Tienda</th><th>Ventas (und)</th><th>Monto (S/)</th><th>Stock (und)</th><th>Stk Val (S/)</th><th>IRP</th><th>Margen %</th><th>IRP proy.</th></tr>
            </thead>
            <tbody>
              {storeRows.map((r) => (
                <tr key={r.store}>
                  <td>{r.store}</td><td>{fmt(r.cant)}</td><td>{fmt(r.val)}</td><td>{fmt(r.stk)}</td><td>{fmt(r.stk_val)}</td>
                  <td><span style={{ color: irpText(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                  <td>{r.mgn}%</td>
                  <td><span style={{ color: irpText(r.irp_proy) }}>{r.irp_proy}%</span></td>
                </tr>
              ))}
              {storeRows.length === 0 && <tr><td colSpan={7} className="muted">Sin datos para el filtro.</td></tr>}
            </tbody>
            {storeRows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                  <td>TOTAL</td><td>{fmt(storeTotals.cant)}</td><td>{fmt(storeTotals.val)}</td>
                  <td>{fmt(storeTotals.stk)}</td><td>{fmt(storeTotals.stk_val)}</td>
                  <td><span style={{ color: irpText(storeTotals.irp) }}>{storeTotals.irp}%</span></td>
                  <td>{storeTotals.mgn}%</td>
                  <td>—</td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="muted" style={{ fontSize: 12 }}>Usa los filtros de arriba (género, mundo, responsable, etc.) para acotar el análisis por tienda.</p>

          <Heatmap title="IRP por rango de precio de venta (por tienda)" rows={storeNames} cols={PRICE_BANDS} cell={(g, c) => storePriceMap.get(`${g}|${c}`)} />
          <Heatmap title="IRP por talla (por tienda)" rows={storeNames} cols={storeTallas} cell={(g, c) => storeTallaMap.get(`${g}|${c}`)} />
        </>
      )}
    </div>
  );
}

function FilterSelect({ label, value, set, options }: { label: string; value: string; set: (v: string) => void; options: string[] }) {
  return (
    <label>{label}<br />
      <select value={value} onChange={(e) => set(e.target.value)}>
        <option value="">Todos</option>
        {(options ?? []).map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

function Kpi({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div className="panel" style={{ minWidth: 150, padding: '10px 14px' }}>
      <div className="muted" style={{ fontSize: 12 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 700, color: color ?? 'inherit' }}>{value}</div>
    </div>
  );
}

function Heatmap({ title, rows, cols, cell }: {
  title: string; rows: string[]; cols: string[];
  cell: (row: string, col: string) => HmCell | undefined;
}) {
  if (rows.length === 0 || cols.length === 0) return null;
  return (
    <div style={{ marginTop: 20 }}>
      <h2 style={{ marginBottom: 6 }}>{title}</h2>
      <div style={{ overflowX: 'auto' }}>
        <table className="panel" style={{ borderCollapse: 'collapse' }}>
          <thead>
            <tr><th style={{ textAlign: 'left' }}></th>{cols.map((c) => <th key={c} style={{ minWidth: 54 }}>{c}</th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r}>
                <td style={{ fontWeight: 600 }}>{r}</td>
                {cols.map((c) => {
                  const v = cell(r, c);
                  const cc = v ? irpCell(v.irp) : null;
                  return (
                    <td key={c}
                      title={v ? `IRP ${v.irp}% · vendidas ${fmt(v.cant)} · stock ${fmt(v.stk ?? 0)}` : 'sin datos'}
                      style={{
                        textAlign: 'center', padding: '6px 4px', fontSize: 12,
                        background: cc ? cc.bg : 'transparent',
                        color: cc ? cc.fg : '#9aa7c2',
                      }}>
                      {v ? `${v.irp}` : '·'}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted" style={{ fontSize: 11 }}>
        Número = IRP %. Verde ≥ 30 · Naranja 20–30 · Rojo &lt; 20. Incluye todo el stock
        (lo no vendido entra por su valor unitario de stock).
      </p>
    </div>
  );
}
