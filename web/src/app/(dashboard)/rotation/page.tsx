'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Store } from '@/lib/types';

const MESES = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
const PRICE_BANDS = ['<9', '9-10', '10-20', '20-30', '30-40', '40-50', '50-70', '70+'];
const IRP_META = 30; // meta de IRP (%) para la escala de color

// Dimensiones por las que se puede agrupar el dashboard.
const GROUPS: { value: string; label: string }[] = [
  { value: 'resp', label: 'Responsable' },
  { value: 'linea', label: 'Línea' },
  { value: 'brand', label: 'Marca' },
  { value: 'mundo', label: 'Mundo' },
  { value: 'gender', label: 'Género' },
];

type Filters = { resp: string[]; gender: string[]; mundo: string[]; embarque: string[]; brand: string[]; linea: string[] };
type GroupRow = { grp: string; cant: number; val: number; stk: number; stk_val: number; irp: number; irp_proy: number };
type HmCell = { grp: string; band?: string; talla?: string; irp: number; cant: number };
type Report = {
  snap: string | null;
  complete: boolean;
  days_total: number;
  days_elapsed: number;
  group_by: string;
  kpis: { cant: number; val: number; stk: number; stk_val: number; irp: number; proy_cant: number; irp_proy: number };
  rows: GroupRow[];
  price_hm: HmCell[];
  talla_hm: HmCell[];
};

function irpColor(irp: number): string {
  const t = Math.max(0, Math.min(1, irp / IRP_META));
  return `hsl(${Math.round(t * 125)}, 70%, 45%)`;
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

  const [report, setReport] = useState<Report | null>(null);
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

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const mm = String(month).padStart(2, '0');
    const from = `${year}-${mm}-01`;
    const to = `${year}-${mm}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;
    const { data, error } = await supabase.rpc('rotation_report', {
      p_from: from, p_to: to, p_group_by: groupBy,
      p_store: storeId || null, p_gender: gender || null, p_mundo: mundo || null,
      p_embarque: embarque || null, p_brand: brand || null, p_linea: linea || null, p_resp: resp || null,
    });
    if (error) {
      setError(error.message);
      setReport(null);
    } else {
      const d = (data ?? {}) as Partial<Report>;
      setReport({
        snap: d.snap ?? null, complete: d.complete ?? true,
        days_total: d.days_total ?? 0, days_elapsed: d.days_elapsed ?? 0, group_by: d.group_by ?? groupBy,
        kpis: d.kpis ?? { cant: 0, val: 0, stk: 0, stk_val: 0, irp: 0, proy_cant: 0, irp_proy: 0 },
        rows: Array.isArray(d.rows) ? d.rows : [],
        price_hm: Array.isArray(d.price_hm) ? d.price_hm : [],
        talla_hm: Array.isArray(d.talla_hm) ? d.talla_hm : [],
      });
    }
    setLoading(false);
  }, [supabase, year, month, groupBy, storeId, gender, mundo, embarque, brand, linea, resp]);

  useEffect(() => { load(); }, [load]);

  const groups = useMemo(() => (report?.rows ?? []).map((r) => r.grp), [report]);
  const priceMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of report?.price_hm ?? []) m.set(`${c.grp}|${c.band}`, c);
    return m;
  }, [report]);
  const tallas = useMemo(() => {
    const s = new Set<string>();
    for (const c of report?.talla_hm ?? []) s.add(c.talla ?? '');
    return [...s].sort();
  }, [report]);
  const tallaMap = useMemo(() => {
    const m = new Map<string, HmCell>();
    for (const c of report?.talla_hm ?? []) m.set(`${c.grp}|${c.talla}`, c);
    return m;
  }, [report]);

  const k = report?.kpis;
  const grpLabel = GROUPS.find((g) => g.value === groupBy)?.label ?? 'Grupo';

  return (
    <div>
      <h1>Rotación (IRP)</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        IRP = Ventas (und) / (Ventas + Stock final) × 100. Meta {IRP_META}%.
      </p>

      <div className="panel row" style={{ gap: 10, flexWrap: 'wrap', alignItems: 'flex-end', marginBottom: 14 }}>
        <label>Agrupar por<br /><select value={groupBy} onChange={(e) => setGroupBy(e.target.value)}>
          {GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
        </select></label>
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
        <FilterSelect label="Responsable" value={resp} set={setResp} options={opts.resp} />
        <FilterSelect label="Género" value={gender} set={setGender} options={opts.gender} />
        <FilterSelect label="Mundo" value={mundo} set={setMundo} options={opts.mundo} />
        <FilterSelect label="Embarque" value={embarque} set={setEmbarque} options={opts.embarque} />
        <FilterSelect label="Marca" value={brand} set={setBrand} options={opts.brand} />
        <FilterSelect label="Línea" value={linea} set={setLinea} options={opts.linea} />
      </div>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {k && !loading && (
        <>
          <div className="row" style={{ gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
            <Kpi label="IRP global" value={`${k.irp}%`} color={irpColor(k.irp)} />
            {!report?.complete && <Kpi label="IRP proyectado" value={`${k.irp_proy}%`} color={irpColor(k.irp_proy)} />}
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
                <th>Stk Val (S/)</th><th>IRP</th>{!report?.complete && <th>IRP proy.</th>}
              </tr>
            </thead>
            <tbody>
              {(report?.rows ?? []).map((r) => (
                <tr key={r.grp}>
                  <td>{r.grp}</td>
                  <td>{fmt(r.cant)}</td>
                  <td>{fmt(r.val)}</td>
                  <td>{fmt(r.stk)}</td>
                  <td>{fmt(r.stk_val)}</td>
                  <td><span style={{ color: irpColor(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                  {!report?.complete && <td><span style={{ color: irpColor(r.irp_proy) }}>{r.irp_proy}%</span></td>}
                </tr>
              ))}
              {(report?.rows ?? []).length === 0 && <tr><td colSpan={7} className="muted">Sin datos para el filtro.</td></tr>}
            </tbody>
          </table>

          <Heatmap title={`Mapa de calor — IRP por rango de precio de venta (por ${grpLabel.toLowerCase()})`}
            rows={groups} cols={PRICE_BANDS} cell={(g, c) => priceMap.get(`${g}|${c}`)} />
          <Heatmap title={`Mapa de calor — IRP por talla (por ${grpLabel.toLowerCase()})`}
            rows={groups} cols={tallas} cell={(g, c) => tallaMap.get(`${g}|${c}`)} />
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
  title: string;
  rows: string[];
  cols: string[];
  cell: (row: string, col: string) => { irp: number; cant: number } | undefined;
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
                  return (
                    <td key={c} title={v ? `IRP ${v.irp}% · ${fmt(v.cant)} und` : 'sin datos'}
                      style={{
                        textAlign: 'center', padding: '6px 4px', fontSize: 12,
                        background: v ? irpColor(v.irp) : 'transparent',
                        color: v ? '#fff' : '#9aa7c2',
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
      <p className="muted" style={{ fontSize: 11 }}>Número = IRP %. Color: rojo (bajo) → verde (≥ meta). Pasa el mouse para ver unidades.</p>
    </div>
  );
}
