'use client';

import { useState } from 'react';
import { parseGenericPrices, type GenericPriceRow } from '@/lib/import/parseExcel';
import { importGenericPrices } from './actions';

const BATCH = 4000;

export default function PreciosImportPage() {
  const [rows, setRows] = useState<GenericPriceRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [orgs, setOrgs] = useState<{ R050: boolean; R040: boolean }>({ R050: true, R040: true });
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setResult(null);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const parsed = parseGenericPrices(buf);
    setRows(parsed.rows);
  }

  async function onImport() {
    setError(null); setResult(null); setBusy(true);
    const selected = (['R050', 'R040'] as const).filter((o) => orgs[o]);
    try {
      let priceRows = 0;
      for (let i = 0; i < rows.length; i += BATCH) {
        setProgress(`Cargando ${Math.min(i + BATCH, rows.length)} / ${rows.length}…`);
        const res = await importGenericPrices(rows.slice(i, i + BATCH), selected);
        if (!res.ok) { setError(res.error); setBusy(false); setProgress(null); return; }
        priceRows += res.data.priceRows;
      }
      setResult(`Listo: ${rows.length} genéricos → ${priceRows} filas de precio (${selected.join(' + ')}).`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error inesperado.');
    } finally {
      setBusy(false); setProgress(null);
    }
  }

  return (
    <div className="panel" style={{ maxWidth: 640 }}>
      <span className="eyebrow">Importar precios (PVP)</span>
      <h1>Precios por genérico</h1>
      <p className="muted">
        Sube el export <b>PVP Rack One</b> (CODIGO_GENERICO, PVP, PVP_ANTERIOR, FECHA_CAMBIO_PVP) o el archivo de
        carga SAP (Material + Precio Vta.Público). Se guarda el historial por genérico y Org. de Ventas.
      </p>

      <div className="row" style={{ margin: '14px 0' }}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
      </div>

      {fileName && <p className="muted">Archivo: <b>{fileName}</b> — genéricos con precio: <b>{rows.length.toLocaleString('es-PE')}</b></p>}

      <div className="row" style={{ gap: 16, margin: '10px 0' }}>
        <span className="eyebrow">Aplicar a Org:</span>
        <label><input type="checkbox" checked={orgs.R050} onChange={(e) => setOrgs({ ...orgs, R050: e.target.checked })} /> R050</label>
        <label><input type="checkbox" checked={orgs.R040} onChange={(e) => setOrgs({ ...orgs, R040: e.target.checked })} /> R040</label>
      </div>

      <button className="gold" disabled={busy || rows.length === 0} onClick={onImport}>
        {busy ? (progress ?? 'Importando…') : 'Importar precios'}
      </button>

      {result && <p className="pos" style={{ marginTop: 12 }}>{result}</p>}
      {error && <p className="neg" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
