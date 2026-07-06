'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { commWeek, previousIsoWeek } from '@/lib/week';

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

// Semáforo de IRP: >=30 verde, 20-30 naranja, <20 rojo (mismo criterio que Rotación).
function irpText(irp: number): string {
  if (irp >= 30) return '#2E7D32';
  if (irp >= 20) return '#B26A00';
  return '#C62828';
}
const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');

export default function FloorPage() {
  const supabase = createClient();
  const [week, setWeek] = useState(() => commWeek());
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  const range = useMemo(() => {
    if (!report?.from) return '';
    const f = (s: string) => { const [y, m, d] = s.split('-'); return `${d}/${m}`; };
    return `${f(report.from)} – ${f(report.to)}`;
  }, [report]);

  return (
    <div>
      <h1>Piso de venta vs Almacén</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Piso = unidades escaneadas en los muebles esa semana. Almacén = stock total − piso.
        Rotación piso (IRP) = Ventas / (Ventas + Piso) × 100.
      </p>

      <div className="panel row" style={{ gap: 10, alignItems: 'center', marginBottom: 14 }}>
        <button className="secondary" onClick={() => setWeek((w) => previousIsoWeek(w))}>◀</button>
        <div style={{ minWidth: 190, textAlign: 'center' }}>
          <div style={{ fontWeight: 700 }}>{week}</div>
          {range && <div className="muted" style={{ fontSize: 12 }}>{range}</div>}
        </div>
        <button className="secondary" onClick={() => setWeek((w) => nextWeek(w))}>▶</button>
        <button className="secondary" onClick={() => setWeek(commWeek())} style={{ marginLeft: 8 }}>Semana actual</button>
      </div>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && report && (
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
                <tr key={r.store}>
                  <td>{r.store}</td><td>{fmt(r.piso)}</td><td>{fmt(r.almacen)}</td><td>{fmt(r.total)}</td>
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
            IRP proy. mes = venta de la semana escalada a {report.dias_mes} días del mes (× {report.dias_mes}/7)
            sobre el piso actual. Verde ≥ 30 · Naranja 20–30 · Rojo &lt; 20.
          </p>
        </>
      )}
    </div>
  );
}
