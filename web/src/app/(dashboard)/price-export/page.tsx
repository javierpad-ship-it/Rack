'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { listExportable, generateExport, discardProposal, type ExportableRow } from './actions';

function money(v: number) {
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
function today(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

type SortKey = 'generic_code' | 'resp' | 'sales_org' | 'status' | 'pvp';
type SortDir = 'asc' | 'desc';

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
  const [sortKey, setSortKey] = useState<SortKey | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>('asc');
  const [discardBusy, setDiscardBusy] = useState<number | null>(null);

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

  // Duplicado = mismo genérico con más de una propuesta todavía sin exportar
  // (las ya exportadas no cuentan: esa ya se resolvió). Al generar, todas las
  // orgs elegidas pisarían el mismo (generic_code, org) en generic_prices.
  const dupCounts = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) {
      if (r.exported_at) continue;
      m.set(r.generic_code, (m.get(r.generic_code) ?? 0) + 1);
    }
    return m;
  }, [rows]);
  const dupGenericCodes = useMemo(
    () => [...dupCounts.entries()].filter(([, c]) => c > 1).map(([g]) => g),
    [dupCounts],
  );

  const visibleRows = useMemo(() => {
    let out = rows.filter((r) => {
      if (!showExported && r.exported_at) return false;
      if (respFilter && (r.resp ?? '(sin responsable)') !== respFilter) return false;
      return true;
    });
    if (sortKey) {
      const dir = sortDir === 'asc' ? 1 : -1;
      const value = (r: ExportableRow): string | number =>
        sortKey === 'pvp' ? (r.decided_pvp ?? r.proposed_pvp) : (r[sortKey] ?? '');
      out = [...out].sort((a, b) => {
        const va = value(a);
        const vb = value(b);
        if (va < vb) return -1 * dir;
        if (va > vb) return 1 * dir;
        return 0;
      });
    }
    return out;
  }, [rows, respFilter, showExported, sortKey, sortDir]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleSort(key: SortKey) {
    if (sortKey !== key) { setSortKey(key); setSortDir('asc'); }
    else if (sortDir === 'asc') setSortDir('desc');
    else { setSortKey(null); }
  }

  function sortArrow(key: SortKey) {
    if (sortKey !== key) return '';
    return sortDir === 'asc' ? ' ▲' : ' ▼';
  }

  async function onDiscard(r: ExportableRow) {
    if (!window.confirm(`¿Descartar la propuesta del genérico ${r.generic_code} (S/ ${money(r.decided_pvp ?? r.proposed_pvp)})? Se deniega y sale de esta lista.`)) return;
    setDiscardBusy(r.id); setError(null);
    const res = await discardProposal(r.id);
    setDiscardBusy(null);
    if (!res.ok) { setError(res.error); return; }
    setSelected((prev) => { const next = new Set(prev); next.delete(r.id); return next; });
    load();
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

  const selectedGenericCodes = rows.filter((r) => selected.has(r.id)).map((r) => r.generic_code);
  const selectedHasDup = new Set(selectedGenericCodes).size !== selectedGenericCodes.length;

  const th = (key: SortKey, label: string) => (
    <th style={{ cursor: 'pointer', userSelect: 'none' }} onClick={() => toggleSort(key)}>
      {label}{sortArrow(key)}
    </th>
  );

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
        <button className="gold" disabled={busy || selected.size === 0 || selectedHasDup} onClick={onGenerate}>
          {busy ? 'Generando…' : `Generar SAP (${selected.size})`}
        </button>
      </div>
      {selectedHasDup && (
        <p className="neg">⚠️ Hay genéricos duplicados en la selección — descartá uno antes de generar.</p>
      )}

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
      {dupGenericCodes.length > 0 && (
        <p className="neg">
          ⚠️ {dupGenericCodes.length} genérico(s) con más de una propuesta lista para exportar:{' '}
          {dupGenericCodes.join(', ')}. Descartá una de cada par antes de generar (fila resaltada abajo).
        </p>
      )}

      <table className="panel">
        <thead>
          <tr>
            <th></th>
            {th('generic_code', 'Genérico')}
            {th('resp', 'Responsable')}
            {th('sales_org', 'Org. origen')}
            {th('status', 'Estado')}
            {th('pvp', 'PVP a cargar')}
            <th>Exportado</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {visibleRows.map((r) => {
            const isDup = !r.exported_at && (dupCounts.get(r.generic_code) ?? 0) > 1;
            return (
              <tr key={r.id} style={isDup ? { background: '#FFF3CD' } : undefined}>
                <td>
                  <input
                    type="checkbox"
                    checked={selected.has(r.id)}
                    disabled={!!r.exported_at}
                    onChange={() => toggle(r.id)}
                  />
                </td>
                <td>
                  {r.generic_code}
                  {isDup && (
                    <span className="pill" style={{ marginLeft: 6, background: '#E8A700', color: '#3a2c00' }}>
                      DUPLICADO
                    </span>
                  )}
                </td>
                <td>{r.resp ?? '(sin responsable)'}</td>
                <td>{r.sales_org ?? '—'}</td>
                <td>{r.status}</td>
                <td>{money(r.decided_pvp ?? r.proposed_pvp)}</td>
                <td>
                  {r.exported_at
                    ? <span className="pos">{new Date(r.exported_at).toLocaleDateString('es-PE')}</span>
                    : <span className="muted">—</span>}
                </td>
                <td>
                  {!r.exported_at && (
                    <button className="secondary neg" disabled={discardBusy === r.id} onClick={() => onDiscard(r)}>
                      {discardBusy === r.id ? '…' : 'Descartar'}
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {visibleRows.length === 0 && (
            <tr><td colSpan={8} className="muted">Sin propuestas para los filtros elegidos.</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
