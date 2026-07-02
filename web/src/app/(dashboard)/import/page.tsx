'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/lib/supabase/client';
import { isoWeek } from '@/lib/week';
import { parseCatalog, parseSales, parseStock, parseSalesDaily, parseStockSnapshot } from '@/lib/import/parseExcel';
import {
  importCatalog,
  importSales,
  importStock,
  importSalesDaily,
  importStockSnapshot,
  existingSalesDates,
} from './actions';
import type { Store } from '@/lib/types';

type Kind = 'catalog' | 'sales_daily' | 'sales' | 'stock_snapshot' | 'stock';

export default function ImportPage() {
  const supabase = createClient();
  const [kind, setKind] = useState<Kind>('catalog');
  const [stores, setStores] = useState<Store[]>([]);
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('name')
      .then(({ data }) => {
        const s = (data ?? []) as Store[];
        setStores(s);
        if (s[0]) setStoreId(s[0].id);
      });
  }, [supabase]);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('Procesando archivo…');
    try {
      const buf = await file.arrayBuffer();
      if (kind === 'catalog') {
        const { rows, errors } = parseCatalog(buf);
        const r = await importCatalog(rows);
        setStatus(`Catálogo: ${r.ok} productos. ${errors.length} filas con error.`);
      } else if (kind === 'sales_daily') {
        if (!storeId) throw new Error('Elegí una tienda');
        const { rows, errors } = parseSalesDaily(buf);
        const dates = [...new Set(rows.map((r) => r.sale_date))];
        const dup = await existingSalesDates(storeId, dates);
        if (dup.length > 0) {
          const list = dup.join(', ');
          const proceed = window.confirm(
            `Ya hay datos cargados para: ${list}.\n\n¿Reemplazar esos días con este archivo?`,
          );
          if (!proceed) {
            setStatus('Cancelado: no se modificó nada.');
            setBusy(false);
            e.target.value = '';
            return;
          }
        }
        const r = await importSalesDaily(storeId, rows);
        setStatus(
          `Ventas diarias: ${r.ok} líneas guardadas y atribuidas. ${errors.length} con error.` +
            (dup.length > 0 ? ` (se reemplazaron ${dup.length} día(s) ya cargado(s))` : ''),
        );
      } else if (kind === 'sales') {
        if (!storeId) throw new Error('Elegí una tienda');
        const { rows, errors } = parseSales(buf);
        const r = await importSales(storeId, week, rows);
        setStatus(`Ventas: ${r.ok} líneas importadas y atribuidas. ${errors.length} con error.`);
      } else if (kind === 'stock_snapshot') {
        if (!storeId) throw new Error('Elegí una tienda');
        const { rows, errors } = parseStockSnapshot(buf);
        const r = await importStockSnapshot(storeId, rows);
        setStatus(`Stock vigente: ${r.ok} variantes (reemplazó la foto anterior). ${errors.length} con error.`);
      } else {
        if (!storeId) throw new Error('Elegí una tienda');
        const { rows, errors } = parseStock(buf);
        const r = await importStock(storeId, week, rows);
        setStatus(`Stock: ${r.ok} líneas. ${errors.length} con error.`);
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  const needsStore = kind !== 'catalog';
  const needsWeek = kind === 'sales' || kind === 'stock';

  return (
    <div>
      <h1>Importar datos</h1>
      <p className="muted">
        Subí un Excel/CSV. Formatos aceptados en <code>docs/FORMATOS_IMPORT.md</code>.
      </p>
      <div className="panel" style={{ maxWidth: 560, display: 'grid', gap: 12 }}>
        <label>
          Tipo de dato
          <br />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="catalog">Catálogo de productos</option>
            <option value="sales_daily">Ventas (diario, con fecha)</option>
            <option value="sales">Ventas (por semana)</option>
            <option value="stock_snapshot">Stock (foto vigente)</option>
            <option value="stock">Stock total (por semana)</option>
          </select>
        </label>

        {needsStore && (
          <div className="row">
            <label>
              Tienda
              <br />
              <select value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {stores.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            </label>
            {needsWeek && (
              <label>
                Semana (ISO)
                <br />
                <input value={week} onChange={(e) => setWeek(e.target.value)} />
              </label>
            )}
          </div>
        )}
        {kind === 'sales_daily' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            La fecha sale del archivo (MES_AÑO + DIA). Cruza por <b>CODIGO_VARIANTE</b>. Si el día ya
            estaba cargado, te avisa antes de reemplazarlo. Se recalcula la semana afectada
            automáticamente.
          </p>
        )}
        {kind === 'stock_snapshot' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Es la <b>foto vigente</b> de stock: <b>reemplaza</b> todo el stock anterior de la tienda.
            Cruza por <b>CODIGO_VARIANTE</b> (Stk Fin Act / Stk Val Act / Costo Prom). Actualiza el
            almacén deducido de la semana vigente.
          </p>
        )}

        <label>
          Archivo
          <br />
          <input type="file" accept=".xlsx,.xls,.csv" onChange={onFile} disabled={busy} />
        </label>

        {status && <p className={status.startsWith('Error') ? '' : 'muted'}>{status}</p>}
      </div>
    </div>
  );
}
