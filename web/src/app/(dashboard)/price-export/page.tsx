'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { listExportable, generateExport, type ExportableRow } from './actions';

function money(v: number) {
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function PriceExportPage() {
  const [rows, setRows] = useState<ExportableRow[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [orgs, setOrgs] = useState<{ R050: boolean; R040: boolean }>({ R050: true, R040: false });
  const [validFrom, setValidFrom] = useState(today());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastExportId, setLastExportId] = useState<number | null>(null);
  const [respFilter, setRespFilter] = useState('');
  const [showExported, setShowExported] = useState(false);

  const load = useCallback(async () => {
    const res = await listExportable();
    if (res.ok) {
      setRows(res.data);
      setSelected(new Set(res.data.filter((r) => !r.exported_at).map((r) => r.id)));
    } else setError(res.error);
  }, []);

  useEffect(() => { load(); }, [load]);

  const resps = useMemo(
    () => Array.from(new Set(rows.map((r) => r.resp ?? '(sin responsable)'))).sort(),
    [rows],
  );

  const visibleRows = useMemo(
    () => rows.filter((r) => {
      if (!showExported && r.exported_at) return false;
      if (respFilter && (r.resp ?? '(sin responsable)') !== respFilter) return false;
      return true;
    }),
    [rows, respFilter, showExported],
  );

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function onGenerate() {
    setBusy(true); setError(null); setLastExportId(null);
    const useOrgs = (['R050', 'R040'] as const).filter((o) => orgs[o]);
    const res = await generateExport([...selected], useOrgs, validFrom);
    setBusy(false);
    if (!res.ok) { setError(res.error); return; }
    setLastExportId(res.data.exportId);
    load();
  }

  return (
    <div>
      <h1>Exportar precios a SAP</h1>
      <p className="muted">
        Marca las propuestas aceptadas/contrapropuestas listas para cargar, elige Org. de Ventas y la fecha de
        inicio de validez, y genera el archivo con la estructura de carga SAP.
      </p>

      <div className="row panel" style={{ gap: 20, margin: '14px 0', alignItems: 'center' }}>
        <span>
          <b>Aplicar a Org:</b>{' '}
          <label><input type="checkbox" checked={orgs.R050} onChange={(e) => setOrgs({ ...orgs, R050: e.target.checked })} /> R050</label>{' '}
          <label><input type="checkbox" checked={orgs.R040} onChange={(e) => setOrgs({ ...orgs, R040: e.target.checked })} /> R040</label>
        </span>
        <span>
          <b>Inicio validez:</b>{' '}
          <input type="date" value={validFrom} onChange={(e) => setValidFrom(e.target.value)} />
          {' '}<span className="muted">Fin: 31.12.9999</span>
        </span>
        <button className="gold" disabled={busy || selected.size === 0} onClick={onGenerate}>
          {busy ? 'Generando…' : `Generar SAP (${selected.size})`}
        </button>
      </div>

      <div className="row panel" style={{ gap: 20, margin: '14px 0', alignItems: 'center' }}>
        <span>
          <b>Responsable:</b>{' '}
          <select value={respFilter} onChange={(e) => setRespFilter(e.target.value)}>
            <option value="">Todos</option>
            {resps.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </span>
        <label>
          <input type="checkbox" checked={showExported} onChange={(e) => setShowExported(e.target.checked)} />
          {' '}Mostrar ya exportados
        </label>
      </div>

      {error && <p className="neg">{error}</p>}
      {lastExportId != null && (
        <p className="pos">
          Lote #{lastExportId} generado.{' '}
          <a href={`/api/export/prices?id=${lastExportId}`}>Descargar .xlsx</a>
        </p>
      )}

      <table className="panel">
        <thead>
          <tr>
            <th></th><th>Genérico</th><th>Responsable</th><th>Org. origen</th><th>Estado</th>
            <th>PVP a cargar</th><th>Exportado</th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => (
            <tr key={r.id}>
              <td>
                <input
                  type="checkbox"
                  checked={selected.has(r.id)}
                  disabled={!!r.exported_at}
                  onChange={() => toggle(r.id)}
                />
              </td>
              <td>{r.generic_code}</td>
              <td>{r.resp ?? '(sin responsable)'}</td>
              <td>{r.sales_org ?? '—'}</td>
              <td>{r.status}</td>
              <td>{money(r.decided_pvp ?? r.proposed_pvp)}</td>
              <td>
                {r.exported_at
                  ? <span className="pos">{new Date(r.exported_at).toLocaleDateString('es-PE')}</span>
                  : <span className="muted">—</span>}
              </td>
            </tr>
          ))}
          {visibleRows.length === 0 && (
            <tr><td colSpan={7} className="muted">Sin propuestas para los filtros elegidos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
