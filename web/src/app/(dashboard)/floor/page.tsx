'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { commWeek, previousIsoWeek } from '@/lib/week';
import type { Store } from '@/lib/types';

// Semana siguiente a 'YYYY-Www' (incremento simple; el servidor valida la etiqueta).
function nextWeek(week: string): string {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return week;
  const year = Number(m[1]);
  const wk = Number(m[2]);
  if (wk >= 52) return `${year + 1}-W01`;
  return `${year}-W${String(wk + 1).padStart(2, '0')}`;
}

type Row = {
  store: string; piso: number; almacen: number; total: number;
  pct_piso: number; ventas: number; irp: number; irp_proy: number;
};
type Tot = Omit<Row, 'store'>;
type Report = { week: string; from: string; to: string; dias_mes: number; rows: Row[]; tot: Tot };

// Breakdown dentro de una tienda.
type BRow = { key: string; piso: number; almacen: number; total: number; ventas: number; irp: number; irp_proy: number; pct_piso: number };
type BTot = Omit<BRow, 'key'>;
type Breakdown = { by: string; rows: BRow[]; tot: BTot };

const DIMS: { value: string; label: string }[] = [
  { value: 'resp', label: 'Responsable' },
  { value: 'gender', label: 'Género' },
  { value: 'mundo', label: 'Mundo' },
  { value: 'linea', label: 'Línea SAP' },
  { value: 'articulo', label: 'Código de artículo' },
];

// Semáforo de IRP: >=30 verde, 20-30 naranja, <20 rojo (mismo criterio que Rotación).
function irpText(irp: number): string {
  if (irp >= 30) return '#2E7D32';
  if (irp >= 20) return '#B26A00';
  return '#C62828';
}
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');

// Construye y descarga un CSV a partir de filas de objetos.
function downloadCsv(filename: string, headers: { key: string; label: string }[], rows: Record<string, unknown>[]) {
  const esc = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return /[",\n;]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map((h) => esc(h.label)).join(',')];
  for (const r of rows) lines.push(headers.map((h) => esc(r[h.key])).join(','));
  // BOM para que Excel abra bien los acentos.
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export default function FloorPage() {
  const supabase = createClient();
  const [stores, setStores] = useState<Store[]>([]);
  const [week, setWeek] = useState(() => commWeek());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // Detalle por tienda.
  const [sel, setSel] = useState<{ id: string; name: string } | null>(null);
  const [dim, setDim] = useState('resp');
  const [bd, setBd] = useState<Breakdown | null>(null);
  const [bdLoading, setBdLoading] = useState(false);

  useEffect(() => {
    supabase.from('stores').select('*').order('name').then(({ data }) => setStores((data ?? []) as Store[]));
  }, [supabase]);

  const storeId = useCallback((name: string) => stores.find((s) => s.name === name)?.id ?? null, [stores]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('floor_vs_warehouse', { p_week: week });
    if (error) {
      setError(error.message);
      setReport(null);
    } else {
      const d = (data ?? {}) as Partial<Report>;
      setReport({
        week: d.week ?? week, from: d.from ?? '', to: d.to ?? '', dias_mes: d.dias_mes ?? 30,
        rows: Array.isArray(d.rows) ? d.rows : [],
        tot: d.tot ?? { piso: 0, almacen: 0, total: 0, pct_piso: 0, ventas: 0, irp: 0, irp_proy: 0 },
      });
    }
    setLoading(false);
  }, [supabase, week]);

  useEffect(() => { load(); }, [load]);

  // Al cambiar de semana, cierra el detalle abierto.
  useEffect(() => { setSel(null); setBd(null); }, [week]);

  // Carga el breakdown de la tienda seleccionada por la dimensión elegida.
  const loadBreakdown = useCallback(async () => {
    if (!sel) return;
    setBdLoading(true);
    const { data, error } = await supabase.rpc('floor_breakdown', { p_week: week, p_store: sel.id, p_by: dim });
    if (error) { setBd(null); } else {
      const d = (data ?? {}) as Partial<Breakdown>;
      setBd({
        by: d.by ?? dim,
        rows: Array.isArray(d.rows) ? d.rows : [],
        tot: d.tot ?? { piso: 0, almacen: 0, total: 0, ventas: 0, irp: 0, irp_proy: 0, pct_piso: 0 },
      });
    }
    setBdLoading(false);
  }, [supabase, week, sel, dim]);

  useEffect(() => { if (sel) loadBreakdown(); }, [sel, dim, loadBreakdown]);

  const range = useMemo(() => {
    if (!report?.from) return '';
    const f = (s: string) => { const [, m, d] = s.split('-'); return `${d}/${m}`; };
    return `${f(report.from)} – ${f(report.to)}`;
  }, [report]);

  async function exportFloorCsv() {
    setExporting(true);
    try {
      const { data, error } = await supabase.rpc('floor_detail', { p_week: week });
      if (error) throw new Error(error.message);
      const rows = (data ?? []) as Record<string, unknown>[];
      if (rows.length === 0) { alert('No hay piso escaneado en esta semana para exportar.'); return; }
      downloadCsv(`piso_de_venta_${week}.csv`, [
        { key: 'tienda', label: 'Tienda' },
        { key: 'mueble', label: 'Mueble (ubicación)' },
        { key: 'sku', label: 'SKU' },
        { key: 'descripcion', label: 'Descripción' },
        { key: 'talla', label: 'Talla' },
        { key: 'color', label: 'Color' },
        { key: 'genero', label: 'Género' },
        { key: 'responsable', label: 'Responsable' },
        { key: 'unidades', label: 'Unidades en piso' },
      ], rows);
    } catch (e) {
      alert(`No se pudo exportar: ${(e as Error).message}`);
    } finally {
      setExporting(false);
    }
  }

  return (
    <div>
      <h1>Piso de venta vs Almacén</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Piso = unidades escaneadas en los muebles esa semana. Almacén = stock total − piso.
        Rotación piso (IRP) = Ventas / (Ventas + Piso) × 100.
      </p>

      <div className="panel row" style={{ gap: 10, alignItems: 'center', marginBottom: 14, flexWrap: 'wrap' }}>
        <button className="secondary" onClick={() => setWeek((w) => previousIsoWeek(w))}>◀</button>
        <div style={{ minWidth: 190, textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{week}</div>
          {range && <div className="muted" style={{ fontSize: 12 }}>{range}</div>}
        </div>
        <button className="secondary" onClick={() => setWeek((w) => nextWeek(w))}>▶</button>
        <button className="secondary" onClick={() => setWeek(commWeek())}>Semana actual</button>
        <button onClick={exportFloorCsv} disabled={exporting} style={{ marginLeft: 'auto' }}>
          {exporting ? 'Exportando…' : '⬇ Exportar piso a CSV'}
        </button>
      </div>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && report && !sel && (
        <>
          <table className="panel">
            <thead>
              <tr>
                <th>Tienda</th><th>Piso (und)</th><th>Almacén (und)</th><th>Total (und)</th>
                <th>% en piso</th><th>Ventas (und)</th><th>IRP piso</th><th>IRP proy. mes</th>
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => (
                <tr
                  key={r.store}
                  onClick={() => { const id = storeId(r.store); if (id) setSel({ id, name: r.store }); }}
                  style={storeId(r.store) ? { cursor: 'pointer' } : undefined}
                  title="Ver detalle de la tienda"
                >
                  <td>{storeId(r.store) ? '▸ ' : ''}{r.store}</td>
                  <td>{fmt(r.piso)}</td><td>{fmt(r.almacen)}</td><td>{fmt(r.total)}</td>
                  <td>{r.pct_piso}%</td><td>{fmt(r.ventas)}</td>
                  <td><span style={{ color: irpText(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                  <td><span style={{ color: irpText(r.irp_proy) }}>{r.irp_proy}%</span></td>
                </tr>
              ))}
              {report.rows.length === 0 && (
                <tr><td colSpan={8} className="muted">
                  Sin datos para esta semana. Si las tiendas aún no escanearon, el piso aparece en 0.
                </td></tr>
              )}
            </tbody>
            {report.rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                  <td>TOTAL</td><td>{fmt(report.tot.piso)}</td><td>{fmt(report.tot.almacen)}</td>
                  <td>{fmt(report.tot.total)}</td><td>{report.tot.pct_piso}%</td><td>{fmt(report.tot.ventas)}</td>
                  <td><span style={{ color: irpText(report.tot.irp) }}>{report.tot.irp}%</span></td>
                  <td><span style={{ color: irpText(report.tot.irp_proy) }}>{report.tot.irp_proy}%</span></td>
                </tr>
              </tfoot>
            )}
          </table>
          <p className="muted" style={{ fontSize: 12 }}>
            Hacé clic en una tienda para ver el detalle. IRP proy. mes = venta de la semana escalada a
            {' '}{report.dias_mes} días del mes (× {report.dias_mes}/7). Verde ≥ 30 · Naranja 20–30 · Rojo &lt; 20.
          </p>
        </>
      )}

      {/* Detalle de una tienda por dimensión */}
      {!loading && sel && (
        <div>
          <div className="row" style={{ gap: 10, alignItems: 'center', marginBottom: 10, flexWrap: 'wrap' }}>
            <button className="secondary" onClick={() => { setSel(null); setBd(null); }}>← Todas las tiendas</button>
            <h2 style={{ margin: 0 }}>{sel.name}</h2>
            <label style={{ marginLeft: 'auto' }}>Ver por{' '}
              <select value={dim} onChange={(e) => setDim(e.target.value)}>
                {DIMS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
              </select>
            </label>
          </div>

          {bdLoading && <p className="muted">Cargando…</p>}
          {!bdLoading && bd && (
            <>
              <table className="panel">
                <thead>
                  <tr>
                    <th>{DIMS.find((d) => d.value === dim)?.label}</th>
                    <th>Piso (und)</th><th>Almacén (und)</th><th>Total (und)</th>
                    <th>% en piso</th><th>Ventas (und)</th><th>IRP piso</th><th>IRP proy. mes</th>
                  </tr>
                </thead>
                <tbody>
                  {bd.rows.map((r) => (
                    <tr key={r.key}>
                      <td>{r.key}</td><td>{fmt(r.piso)}</td><td>{fmt(r.almacen)}</td><td>{fmt(r.total)}</td>
                      <td>{r.pct_piso}%</td><td>{fmt(r.ventas)}</td>
                      <td><span style={{ color: irpText(r.irp), fontWeight: 700 }}>{r.irp}%</span></td>
                      <td><span style={{ color: irpText(r.irp_proy) }}>{r.irp_proy}%</span></td>
                    </tr>
                  ))}
                  {bd.rows.length === 0 && <tr><td colSpan={8} className="muted">Sin datos para esta tienda/semana.</td></tr>}
                </tbody>
                {bd.rows.length > 0 && (
                  <tfoot>
                    <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                      <td>TOTAL</td><td>{fmt(bd.tot.piso)}</td><td>{fmt(bd.tot.almacen)}</td><td>{fmt(bd.tot.total)}</td>
                      <td>{bd.tot.pct_piso}%</td><td>{fmt(bd.tot.ventas)}</td>
                      <td><span style={{ color: irpText(bd.tot.irp) }}>{bd.tot.irp}%</span></td>
                      <td><span style={{ color: irpText(bd.tot.irp_proy) }}>{bd.tot.irp_proy}%</span></td>
                    </tr>
                  </tfoot>
                )}
              </table>
              <p className="muted" style={{ fontSize: 12 }}>
                Piso = escaneado en muebles · Almacén = stock − piso · % en piso = qué parte del stock
                está expuesta. Muestra dónde está la mercadería y cómo rota por {DIMS.find((d) => d.value === dim)?.label.toLowerCase()}.
              </p>
            </>
          )}
        </div>
      )}
    </div>
  );
}
