'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type DayCell = { date: string; vendidas: number; repuestas: number };
type Row = { store: string; total_vendidas: number; total_repuestas: number; total: number; by_date: DayCell[] };
type Tot = { total_vendidas: number; total_repuestas: number; total: number };
type Report = { from: string; to: string; dates: string[]; rows: Row[]; tot: Tot };

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');
const fmtDay = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function RepuestosPage() {
  const supabase = createClient();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('restock_vs_sales', { p_days: 7 });
    if (error) {
      setError(error.message);
      setReport(null);
    } else {
      const d = (data ?? {}) as Partial<Report>;
      setReport({
        from: d.from ?? '', to: d.to ?? '',
        dates: Array.isArray(d.dates) ? d.dates : [],
        rows: Array.isArray(d.rows) ? d.rows : [],
        tot: d.tot ?? { total_vendidas: 0, total_repuestas: 0, total: 0 },
      });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1>Vendido vs Repuesto</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Unidades <span style={{ color: '#2E9E44', fontWeight: 700 }}>vendidas</span> vs{' '}
        <span style={{ color: '#0E7BA8', fontWeight: 700 }}>repuestas</span> (Rack One - Repo) por tienda, últimos 7 días.
        La columna <b>Total período</b> es la suma de ambas en el rango.
      </p>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && report && (
        <div style={{ overflowX: 'auto' }}>
          <table className="panel" style={{ minWidth: 900, borderCollapse: 'collapse' }}>
            <thead>
              <tr>
                <th>Tienda</th>
                <th>Total período</th>
                {report.dates.map((d) => <th key={d} style={{ minWidth: 70, textAlign: 'center' }}>{fmtDay(d)}</th>)}
              </tr>
            </thead>
            <tbody>
              {report.rows.map((r) => {
                const byDate = new Map(r.by_date.map((c) => [c.date, c]));
                return (
                  <tr key={r.store}>
                    <td>{r.store}</td>
                    <td title={`Vendidas: ${fmt(r.total_vendidas)} · Repuestas: ${fmt(r.total_repuestas)}`} style={{ fontWeight: 700 }}>
                      {fmt(r.total)}
                    </td>
                    {report.dates.map((d) => {
                      const c = byDate.get(d);
                      return (
                        <td key={d} style={{ textAlign: 'center', fontSize: 12 }}>
                          <div style={{ color: '#2E9E44', fontWeight: 600 }}>{fmt(c?.vendidas ?? 0)}</div>
                          <div style={{ color: '#0E7BA8', fontWeight: 600 }}>{fmt(c?.repuestas ?? 0)}</div>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
              {report.rows.length === 0 && (
                <tr><td colSpan={2 + report.dates.length} className="muted">Sin datos para este período.</td></tr>
              )}
            </tbody>
            {report.rows.length > 0 && (
              <tfoot>
                <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                  <td>TOTAL</td>
                  <td title={`Vendidas: ${fmt(report.tot.total_vendidas)} · Repuestas: ${fmt(report.tot.total_repuestas)}`}>
                    {fmt(report.tot.total)}
                  </td>
                  {report.dates.map((d) => {
                    const v = report.rows.reduce((a, r) => a + (r.by_date.find((c) => c.date === d)?.vendidas ?? 0), 0);
                    const rr = report.rows.reduce((a, r) => a + (r.by_date.find((c) => c.date === d)?.repuestas ?? 0), 0);
                    return (
                      <td key={d} style={{ textAlign: 'center', fontSize: 12 }}>
                        <div style={{ color: '#2E9E44' }}>{fmt(v)}</div>
                        <div style={{ color: '#0E7BA8' }}>{fmt(rr)}</div>
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            )}
          </table>
          <p className="muted" style={{ fontSize: 11 }}>
            Cada celda diaria: arriba <span style={{ color: '#2E9E44' }}>vendidas</span>, abajo{' '}
            <span style={{ color: '#0E7BA8' }}>repuestas</span>.
          </p>
        </div>
      )}
    </div>
  );
}
