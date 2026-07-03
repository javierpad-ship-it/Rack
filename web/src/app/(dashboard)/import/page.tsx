'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import {
  parseSalesDaily,
  parseStockSnapshot,
  type SalesDailyRow,
  type StockSnapshotRow,
} from '@/lib/import/parseExcel';
import {
  existingSalesDates,
  appendSalesDaily,
  recomputeSalesDaily,
  beginStockSnapshot,
  appendStockSnapshot,
  finalizeStockSnapshot,
} from './actions';
import { resolveStoreLabels } from '../store-aliases/actions';
import type { Store } from '@/lib/types';

// Solo carga masiva multi-tienda: ventas diarias (con fecha por fila) y stock
// (foto por fecha). La tienda de cada fila sale de la columna TIENDA (Mapeo);
// no se elige tienda ni semana a mano. El catálogo se deriva del stock.
type Kind = 'sales_daily' | 'stock_snapshot';

// Reparte filas por tienda usando la columna TIENDA del archivo (mapeada en
// /store-aliases). Las filas sin TIENDA o de una tienda sin mapear no se cargan.
async function resolveRows<T extends { store_label: string | null }>(
  rows: T[],
): Promise<{ resolved: (T & { storeId: string })[]; unmapped: { label: string; count: number }[] }> {
  const labels = [...new Set(rows.map((r) => r.store_label).filter((l): l is string => !!l))];
  const map = labels.length > 0 ? await resolveStoreLabels(labels) : { ok: true as const, data: {} };
  if (!map.ok) throw new Error(map.error);

  const unmappedCounts = new Map<string, number>();
  const resolved: (T & { storeId: string })[] = [];
  for (const r of rows) {
    if (!r.store_label) continue; // sin TIENDA no se puede repartir
    const sid = map.data[r.store_label];
    if (sid) {
      resolved.push({ ...r, storeId: sid });
    } else {
      unmappedCounts.set(r.store_label, (unmappedCounts.get(r.store_label) ?? 0) + 1);
    }
  }
  const unmapped = [...unmappedCounts.entries()].map(([label, count]) => ({ label, count }));
  return { resolved, unmapped };
}

function unmappedMsg(unmapped: { label: string; count: number }[]): string {
  if (unmapped.length === 0) return '';
  const list = unmapped.map((u) => `${u.label} (${u.count})`).join(', ');
  return ` ⚠️ Sin mapear (no se cargaron): ${list}. Agregalas en Mapeo de tiendas.`;
}

export default function ImportPage() {
  const supabase = createClient();
  const [kind, setKind] = useState<Kind>('sales_daily');
  const [stores, setStores] = useState<Store[]>([]);
  // Fecha de la foto de stock (por defecto hoy). Marca a qué día es la carga.
  const [stockDate, setStockDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    supabase
      .from('stores')
      .select('*')
      .order('name')
      .then(({ data }) => setStores((data ?? []) as Store[]));
  }, [supabase]);

  const storeName = (id: string) => stores.find((s) => s.id === id)?.name ?? id;

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setBusy(true);
    setStatus('Procesando archivo…');
    try {
      const buf = await file.arrayBuffer();
      if (kind === 'sales_daily') {
        const { rows, errors } = parseSalesDaily(buf);
        const { resolved, unmapped } = await resolveRows<SalesDailyRow>(rows);
        if (resolved.length === 0) {
          setStatus(`Nada para importar.${unmappedMsg(unmapped)}`);
          return;
        }
        const pairs = [...new Set(resolved.map((r) => `${r.storeId}|${r.sale_date}`))].map((k) => {
          const [sId, date] = k.split('|');
          return { storeId: sId, date };
        });
        const dup = await existingSalesDates(pairs);
        if (dup.length > 0) {
          const list = dup.map((d) => `${storeName(d.storeId)}: ${d.date}`).join('\n');
          const proceed = window.confirm(`Ya hay datos cargados para:\n${list}\n\n¿Reemplazarlos?`);
          if (!proceed) {
            setStatus('Cancelado: no se modificó nada.');
            return;
          }
        }
        // Agrega en el navegador por (tienda, fecha, sku) y sube en lotes para
        // no exceder el límite de tamaño de los Server Actions.
        type Agg = { store_id: string } & Omit<SalesDailyRow, 'store_label'>;
        const agg = new Map<string, Agg>();
        const range = new Map<string, { from: string; to: string }>();
        for (const row of resolved) {
          const { store_label, storeId: sid, ...rest } = row;
          const key = `${sid}|${rest.sale_date}|${rest.sku}`;
          const prev = agg.get(key);
          if (prev) {
            prev.units += rest.units;
            prev.amount += rest.amount;
            prev.margin += rest.margin;
          } else {
            agg.set(key, { store_id: sid, ...rest });
          }
          const rg = range.get(sid);
          if (!rg) range.set(sid, { from: rest.sale_date, to: rest.sale_date });
          else {
            if (rest.sale_date < rg.from) rg.from = rest.sale_date;
            if (rest.sale_date > rg.to) rg.to = rest.sale_date;
          }
        }
        const aggRows = [...agg.values()];
        const CHUNK = 4000;
        for (let i = 0; i < aggRows.length; i += CHUNK) {
          await appendSalesDaily(aggRows.slice(i, i + CHUNK));
          setStatus(`Subiendo ventas… ${Math.min(100, Math.round(((i + CHUNK) / aggRows.length) * 100))}%`);
        }
        setStatus('Recalculando semanas y atribución…');
        const ranges = [...range.entries()].map(([storeId, rg]) => ({ storeId, from: rg.from, to: rg.to, rows: 0 }));
        await recomputeSalesDaily(ranges);
        setStatus(
          `Ventas diarias: ${aggRows.length} líneas guardadas y atribuidas. ${errors.length} con error de formato.` +
            (dup.length > 0 ? ` Se reemplazaron ${dup.length} combinación(es) tienda/día.` : '') +
            unmappedMsg(unmapped),
        );
      } else {
        // stock_snapshot
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stockDate)) throw new Error('Elegí la fecha de la foto de stock.');
        const { rows, errors } = parseStockSnapshot(buf);
        const { resolved, unmapped } = await resolveRows<StockSnapshotRow>(rows);
        if (resolved.length === 0) {
          setStatus(`Nada para importar.${unmappedMsg(unmapped)}`);
          return;
        }
        // Dedup por (tienda, sku) y subida por lotes: begin (borra) → append × N → finalize.
        const byStore = new Map<string, Map<string, Record<string, unknown>>>();
        for (const row of resolved) {
          const { store_label, storeId: sid, ...rest } = row;
          if (!byStore.has(sid)) byStore.set(sid, new Map());
          byStore.get(sid)!.set(rest.sku, rest);
        }
        let total = 0;
        const CHUNK = 2000;
        for (const [sid, m] of byStore) {
          const rowsArr = [...m.values()];
          await beginStockSnapshot(sid, stockDate);
          for (let i = 0; i < rowsArr.length; i += CHUNK) {
            await appendStockSnapshot(sid, stockDate, rowsArr.slice(i, i + CHUNK) as never);
            setStatus(
              `Subiendo stock (${storeName(sid)})… ${Math.min(100, Math.round(((i + CHUNK) / rowsArr.length) * 100))}%`,
            );
          }
          await finalizeStockSnapshot(sid, stockDate, rowsArr.length);
          total += rowsArr.length;
        }
        setStatus(
          `Stock al ${stockDate}: ${total} variantes guardadas (foto por fecha + stock vigente). ` +
            `${errors.length} con error de formato.${unmappedMsg(unmapped)}`,
        );
      }
    } catch (err) {
      setStatus(`Error: ${(err as Error).message}`);
    } finally {
      setBusy(false);
      e.target.value = '';
    }
  }

  return (
    <div>
      <h1>Importar datos</h1>
      <p className="muted">
        Carga masiva: un solo archivo con <b>todas las tiendas</b> (columna TIENDA). Formatos en{' '}
        <code>docs/FORMATOS_IMPORT.md</code>.
      </p>
      <div className="panel" style={{ maxWidth: 620, display: 'grid', gap: 12 }}>
        <label>
          Tipo de dato
          <br />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="sales_daily">Ventas (diario, con fecha)</option>
            <option value="stock_snapshot">Stock (foto por fecha)</option>
          </select>
        </label>

        {kind === 'stock_snapshot' && (
          <label>
            Fecha de la foto <span className="muted">(a qué día es el stock)</span>
            <br />
            <input type="date" value={stockDate} onChange={(e) => setStockDate(e.target.value)} />
          </label>
        )}

        <p className="muted" style={{ fontSize: 13, margin: 0 }}>
          Cada fila se reparte sola por tienda según el <Link href="/store-aliases">Mapeo de tiendas</Link>.
          Si una tienda no está mapeada, esas filas no se cargan y te avisamos cuáles son.
        </p>
        {kind === 'sales_daily' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            La fecha sale del archivo (columna <b>FECHA</b> tipo DD/MM/AAAA). Cruza por{' '}
            <b>CODIGO_VARIANTE</b>; usa Cant Act / Venta Act / MG Act. Si el día ya estaba cargado para
            esa tienda, te avisa antes de reemplazarlo.
          </p>
        )}
        {kind === 'stock_snapshot' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Foto de stock a la <b>fecha</b> que elijas. Se guarda por fecha (para conservar el cierre de
            mes) y actualiza el <b>stock vigente</b>. Cruza por <b>CODIGO_VARIANTE</b> (Stk Fin Act / Stk
            Val Act / Costo Prom). Actualiza el almacén deducido de esa semana y el <b>catálogo</b>.
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
