'use client';

import { useEffect, useState, useCallback } from 'react';
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

  const load = useCallback(async () => {
    const res = await listExportable();
    if (res.ok) {
      setRows(res.data);
      setSelected(new Set(res.data.map((r) => r.id)));
    } else setError(res.error);
  }, []);

  useEffect(() => { load(); }, [load]);

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
            <th></th><th>Genérico</th><th>Org. origen</th><th>Estado</th><th>PVP a cargar</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id}>
              <td><input type="checkbox" checked={selected.has(r.id)} onChange={() => toggle(r.id)} /></td>
              <td>{r.generic_code}</td>
              <td>{r.sales_org ?? '—'}</td>
              <td>{r.status}</td>
              <td>{money(r.decided_pvp ?? r.proposed_pvp)}</td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={5} className="muted">Sin propuestas aceptadas pendientes de exportar.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
