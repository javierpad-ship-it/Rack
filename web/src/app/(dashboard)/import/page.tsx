'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { createClient } from '@/lib/supabase/client';
import { isoWeek } from '@/lib/week';
import {
  parseSales,
  parseStock,
  parseSalesDaily,
  parseStockSnapshot,
  type SalesDailyRow,
  type StockSnapshotRow,
} from '@/lib/import/parseExcel';
import {
  importSales,
  importStock,
  existingSalesDates,
  appendSalesDaily,
  recomputeSalesDaily,
  beginStockSnapshot,
  appendStockSnapshot,
  finalizeStockSnapshot,
} from './actions';
import { resolveStoreLabels } from '../store-aliases/actions';
import type { Store } from '@/lib/types';

// El catálogo de productos ya no se carga aparte: se deriva de "Stock (foto
// vigente)" (sku, nombre, familia/categoría). Ver importStockSnapshot.
type Kind = 'sales_daily' | 'sales' | 'stock_snapshot' | 'stock';

// Reparte filas por tienda usando la columna TIENDA del archivo (mapeada en
// /store-aliases). Si una fila no trae TIENDA, cae en `fallbackStoreId`
// (selector de la pantalla). Devuelve las filas resueltas + las que quedaron
// sin poder repartirse (tienda del archivo sin mapeo todavía).
async function resolveRows<T extends { store_label: string | null }>(
  rows: T[],
  fallbackStoreId: string,
): Promise<{ resolved: (T & { storeId: string })[]; unmapped: { label: string; count: number }[] }> {
  const labels = [...new Set(rows.map((r) => r.store_label).filter((l): l is string => !!l))];
  const map = labels.length > 0 ? await resolveStoreLabels(labels) : { ok: true as const, data: {} };
  if (!map.ok) throw new Error(map.error);

  const unmappedCounts = new Map<string, number>();
  const resolved: (T & { storeId: string })[] = [];
  for (const r of rows) {
    if (!r.store_label) {
      if (!fallbackStoreId) continue; // se cuenta como error por fuera
      resolved.push({ ...r, storeId: fallbackStoreId });
      continue;
    }
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
  const [storeId, setStoreId] = useState('');
  const [week, setWeek] = useState(isoWeek());
  // Fecha de la foto de stock (por defecto hoy). Marca a qué día es la carga.
  const [stockDate, setStockDate] = useState(() => new Date().toISOString().slice(0, 10));
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
      if (kind === 'sales_daily') {
        const { rows, errors } = parseSalesDaily(buf);
        const { resolved, unmapped } = await resolveRows<SalesDailyRow>(rows, storeId);
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
          const list = dup
            .map((d) => `${stores.find((s) => s.id === d.storeId)?.name ?? d.storeId}: ${d.date}`)
            .join('\n');
          const proceed = window.confirm(`Ya hay datos cargados para:\n${list}\n\n¿Reemplazarlos?`);
          if (!proceed) {
            setStatus('Cancelado: no se modificó nada.');
            return;
          }
        }
        // Agrega en el navegador por (tienda, fecha, sku) y sube en lotes para
        // no exceder el límite de tamaño de los Server Actions.
        const agg = new Map<string, { store_id: string; sale_date: string; sku: string } & Record<string, unknown>>();
        const range = new Map<string, { from: string; to: string; rows: number }>();
        for (const row of resolved) {
          const { store_label, storeId: sid, ...rest } = row;
          const key = `${sid}|${rest.sale_date}|${rest.sku}`;
          const prev = agg.get(key) as (typeof rest & { store_id: string }) | undefined;
          if (prev) {
            prev.units += rest.units;
            prev.amount += rest.amount;
            prev.margin += rest.margin;
          } else {
            agg.set(key, { store_id: sid, ...rest });
          }
          const rg = range.get(sid);
          if (!rg) range.set(sid, { from: rest.sale_date, to: rest.sale_date, rows: 0 });
          else {
            if (rest.sale_date < rg.from) rg.from = rest.sale_date;
            if (rest.sale_date > rg.to) rg.to = rest.sale_date;
          }
        }
        const aggRows = [...agg.values()];
        for (const rg of range.values()) rg.rows = 0;
        const CHUNK = 4000;
        for (let i = 0; i < aggRows.length; i += CHUNK) {
          await appendSalesDaily(aggRows.slice(i, i + CHUNK) as never);
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
      } else if (kind === 'sales') {
        if (!storeId) throw new Error('Elegí una tienda');
        const { rows, errors } = parseSales(buf);
        const r = await importSales(storeId, week, rows);
        setStatus(`Ventas: ${r.ok} líneas importadas y atribuidas. ${errors.length} con error.`);
      } else if (kind === 'stock_snapshot') {
        const { rows, errors } = parseStockSnapshot(buf);
        const { resolved, unmapped } = await resolveRows<StockSnapshotRow>(rows, storeId);
        if (resolved.length === 0) {
          setStatus(`Nada para importar.${unmappedMsg(unmapped)}`);
          return;
        }
        if (!/^\d{4}-\d{2}-\d{2}$/.test(stockDate)) throw new Error('Elegí la fecha de la foto de stock.');
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
              `Subiendo stock (${stores.find((s) => s.id === sid)?.name ?? sid})… ` +
                `${Math.min(100, Math.round(((i + CHUNK) / rowsArr.length) * 100))}%`,
            );
          }
          await finalizeStockSnapshot(sid, stockDate, rowsArr.length);
          total += rowsArr.length;
        }
        setStatus(
          `Stock al ${stockDate}: ${total} variantes guardadas (foto por fecha + stock vigente). ` +
            `${errors.length} con error de formato.${unmappedMsg(unmapped)}`,
        );
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

  const needsWeek = kind === 'sales' || kind === 'stock';
  const multiStore = kind === 'sales_daily' || kind === 'stock_snapshot';

  return (
    <div>
      <h1>Importar datos</h1>
      <p className="muted">
        Subí un Excel/CSV. Formatos aceptados en <code>docs/FORMATOS_IMPORT.md</code>.
      </p>
      <div className="panel" style={{ maxWidth: 620, display: 'grid', gap: 12 }}>
        <label>
          Tipo de dato
          <br />
          <select value={kind} onChange={(e) => setKind(e.target.value as Kind)}>
            <option value="sales_daily">Ventas (diario, con fecha)</option>
            <option value="sales">Ventas (por semana)</option>
            <option value="stock_snapshot">Stock (foto vigente)</option>
            <option value="stock">Stock total (por semana)</option>
          </select>
        </label>

        <div className="row">
          <label>
            Tienda {multiStore && <span className="muted">(respaldo, si la fila no trae TIENDA)</span>}
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
          {kind === 'stock_snapshot' && (
            <label>
              Fecha de la foto <span className="muted">(a qué día es el stock)</span>
              <br />
              <input type="date" value={stockDate} onChange={(e) => setStockDate(e.target.value)} />
            </label>
          )}
        </div>
        {multiStore && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Un solo archivo puede traer <b>todas las tiendas juntas</b> (columna TIENDA): cada fila se
            reparte sola según el{' '}
            <Link href="/store-aliases">Mapeo de tiendas</Link>. Si una tienda no está mapeada, esas
            filas no se cargan y te avisamos cuáles son.
          </p>
        )}
        {kind === 'sales_daily' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            La fecha sale del archivo (columna <b>FECHA</b> tipo DD/MM/AAAA, o MES_AÑO + DIA). Cruza por{' '}
            <b>CODIGO_VARIANTE</b>; usa Cant Act / Venta Act / MG Act. Si el día ya estaba cargado para
            esa tienda, te avisa antes de reemplazarlo.
          </p>
        )}
        {kind === 'stock_snapshot' && (
          <p className="muted" style={{ fontSize: 13, margin: 0 }}>
            Es la foto de stock a la <b>fecha</b> que elijas. Se guarda por fecha (para conservar el
            cierre de mes) y actualiza el <b>stock vigente</b> de cada tienda. Cruza por{' '}
            <b>CODIGO_VARIANTE</b> (Stk Fin Act / Stk Val Act / Costo Prom). Actualiza el almacén
            deducido de esa semana y el <b>catálogo de productos</b>.
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
