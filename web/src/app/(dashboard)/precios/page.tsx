'use client';

import { useState } from 'react';
import Link from 'next/link';
import { parseGenericPrices, type GenericPriceRow } from '@/lib/import/parseExcel';
import { importGenericPrices } from './actions';

const BATCH = 4000;

export default function PreciosImportPage() {
  const [rows, setRows] = useState<GenericPriceRow[]>([]);
  const [fileName, setFileName] = useState('');
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [unmatched, setUnmatched] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    setError(null); setResult(null); setUnmatched([]);
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    const buf = await file.arrayBuffer();
    const parsed = parseGenericPrices(buf);
    setRows(parsed.rows);
  }

  async function onImport() {
    setError(null); setResult(null); setUnmatched([]); setBusy(true);
    try {
      let priceRows = 0;
      const unmatchedSet = new Set<string>();
      for (let i = 0; i < rows.length; i += BATCH) {
        setProgress(`Cargando ${Math.min(i + BATCH, rows.length)} / ${rows.length}…`);
        const res = await importGenericPrices(rows.slice(i, i + BATCH));
        if (!res.ok) { setError(res.error); setBusy(false); setProgress(null); return; }
        priceRows += res.data.priceRows;
        res.data.unmatched.forEach((u) => unmatchedSet.add(u));
      }
      setResult(`Listo: ${rows.length} filas de genérico×empresa → ${priceRows} filas de precio guardadas.`);
      setUnmatched([...unmatchedSet]);
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
        Sube el archivo con columnas <b>EMPRESA, CODIGO_GENERICO, PVP, PVP_ANTERIOR, FECHA_CAMBIO_PVP</b>.
        La EMPRESA debe coincidir (nombre, nombre de reporte o código SAP) con una empresa dada de alta en{' '}
        <Link href="/empresas">Mantenimiento → Empresas</Link>. Se guarda el historial por genérico y empresa.
      </p>

      <div className="row" style={{ margin: '14px 0' }}>
        <input type="file" accept=".csv,.xlsx,.xls" onChange={onFile} />
      </div>

      {fileName && <p className="muted">Archivo: <b>{fileName}</b> — filas genérico×empresa: <b>{rows.length.toLocaleString('es-PE')}</b></p>}

      <button className="gold" disabled={busy || rows.length === 0} onClick={onImport}>
        {busy ? (progress ?? 'Importando…') : 'Importar precios'}
      </button>

      {result && <p className="pos" style={{ marginTop: 12 }}>{result}</p>}
      {unmatched.length > 0 && (
        <p className="neg" style={{ marginTop: 8 }}>
          ⚠️ Sin cargar (empresa no encontrada): {unmatched.join(', ')}. Creá esas empresas en{' '}
          <Link href="/empresas">Empresas</Link> (o corregí el nombre) y volvé a importar.
        </p>
      )}
      {error && <p className="neg" style={{ marginTop: 12 }}>{error}</p>}
    </div>
  );
}
