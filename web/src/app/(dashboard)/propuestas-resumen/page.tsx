'use client';

import { useEffect, useState, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';

type Row = { usuario: string; total: number; aceptadas: number; pendientes: number; denegadas: number };
type Tot = Omit<Row, 'usuario'>;
type Report = { from: string; to: string; rows: Row[]; tot: Tot };

const fmt = (n: number) => Math.round(Number(n) || 0).toLocaleString('es-PE');
const fmtDate = (iso: string) => {
  const [, m, d] = iso.split('-');
  return `${d}/${m}`;
};

export default function PropuestasResumenPage() {
  const supabase = createClient();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase.rpc('price_proposals_by_user', { p_days: 15 });
    if (error) {
      setError(error.message);
      setReport(null);
    } else {
      const d = (data ?? {}) as Partial<Report>;
      setReport({
        from: d.from ?? '', to: d.to ?? '',
        rows: Array.isArray(d.rows) ? d.rows : [],
        tot: d.tot ?? { total: 0, aceptadas: 0, pendientes: 0, denegadas: 0 },
      });
    }
    setLoading(false);
  }, [supabase]);

  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <h1>Propuestas de precio por usuario</h1>
      <p className="muted" style={{ marginTop: 0 }}>
        Últimos 15 días{report ? ` (${fmtDate(report.from)} – ${fmtDate(report.to)})` : ''}. Pendientes incluye contrapropuesta (aún sin cerrar).
      </p>

      {error && <p className="neg">Error: {error}</p>}
      {loading && <p className="muted">Cargando…</p>}

      {!loading && report && (
        <table className="panel">
          <thead>
            <tr>
              <th>Usuario</th><th>Total propuestas</th>
              <th style={{ color: '#2E7D32' }}>Aceptadas</th>
              <th style={{ color: '#B26A00' }}>Pendientes</th>
              <th style={{ color: '#C62828' }}>Denegadas</th>
            </tr>
          </thead>
          <tbody>
            {report.rows.map((r) => (
              <tr key={r.usuario}>
                <td>{r.usuario}</td>
                <td style={{ fontWeight: 700 }}>{fmt(r.total)}</td>
                <td style={{ color: '#2E7D32', fontWeight: 600 }}>{fmt(r.aceptadas)}</td>
                <td style={{ color: '#B26A00', fontWeight: 600 }}>{fmt(r.pendientes)}</td>
                <td style={{ color: '#C62828', fontWeight: 600 }}>{fmt(r.denegadas)}</td>
              </tr>
            ))}
            {report.rows.length === 0 && (
              <tr><td colSpan={5} className="muted">Sin propuestas en este período.</td></tr>
            )}
          </tbody>
          {report.rows.length > 0 && (
            <tfoot>
              <tr style={{ fontWeight: 700, borderTop: '2px solid #2B5BE2' }}>
                <td>TOTAL</td>
                <td>{fmt(report.tot.total)}</td>
                <td style={{ color: '#2E7D32' }}>{fmt(report.tot.aceptadas)}</td>
                <td style={{ color: '#B26A00' }}>{fmt(report.tot.pendientes)}</td>
                <td style={{ color: '#C62828' }}>{fmt(report.tot.denegadas)}</td>
              </tr>
            </tfoot>
          )}
        </table>
      )}
    </div>
  );
}
