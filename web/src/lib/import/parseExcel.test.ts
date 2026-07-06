import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCatalog, parseSales, parseStock, parseSalesDaily } from './parseExcel';

// CSV crudo (como lo exporta el POS) a ArrayBuffer.
function csvBuffer(text: string): ArrayBuffer {
  return new TextEncoder().encode(text).buffer as ArrayBuffer;
}

// Construye un ArrayBuffer de Excel a partir de una matriz (encabezados + filas).
function xlsxBuffer(rows: (string | number)[][]): ArrayBuffer {
  const sheet = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, sheet, 'Hoja1');
  const out = XLSX.write(wb, { type: 'array', bookType: 'xlsx' });
  return out as ArrayBuffer;
}

describe('parseCatalog', () => {
  it('lee sku, nombre, ean y familia con encabezados normalizados', () => {
    const buf = xlsxBuffer([
      ['SKU', 'Descripción', 'EAN', 'Familia'],
      ['A1', 'Remera azul', '779000001', 'Indumentaria'],
    ]);
    const { rows, errors } = parseCatalog(buf);
    expect(errors).toHaveLength(0);
    expect(rows[0]).toMatchObject({
      sku: 'A1',
      name: 'Remera azul',
      ean: '779000001',
      family: 'Indumentaria',
    });
  });

  it('reporta error cuando falta el SKU', () => {
    const buf = xlsxBuffer([
      ['sku', 'nombre'],
      ['', 'Sin código'],
    ]);
    const { rows, errors } = parseCatalog(buf);
    expect(rows).toHaveLength(0);
    expect(errors).toHaveLength(1);
  });
});

describe('parseSales', () => {
  it('acepta alias de columnas (cantidad/importe) y castea números', () => {
    const buf = xlsxBuffer([
      ['codigo', 'cantidad', 'importe'],
      ['A1', 5, 1234.5],
    ]);
    const { rows } = parseSales(buf);
    expect(rows[0]).toEqual({ sku: 'A1', units: 5, amount: 1234.5 });
  });
});

describe('parseSalesDaily', () => {
  // Regresión: xlsx convertía las fechas DD/MM con día <= 12 (01/06, 12/06) a
  // serial numérico (interpretándolas como MM/DD), y esas filas se descartaban
  // (se perdían los días 1-12 del mes). Con raw:true deben leerse todas.
  it('lee todas las fechas DD/MM incluidas las de día <= 12', () => {
    const buf = csvBuffer(
      [
        'FECHA,CODIGO_VARIANTE,TIENDA,Cant Act,Venta Act,MG Act',
        '01/06/2026,SKU1,El Sol,5,100,50',
        '12/06/2026,SKU2,El Sol,2,40,20',
        '13/06/2026,SKU3,El Sol,7,140,70',
        '30/06/2026,SKU4,El Sol,4,80,40',
      ].join('\n'),
    );
    const { rows, errors } = parseSalesDaily(buf);
    expect(errors).toHaveLength(0);
    expect(rows.map((r) => r.sale_date)).toEqual([
      '2026-06-01',
      '2026-06-12',
      '2026-06-13',
      '2026-06-30',
    ]);
    expect(rows.reduce((a, r) => a + r.units, 0)).toBe(18);
  });

  // Regresión: el POS exporta el CODIGO_VARIANTE con ceros a la izquierda
  // (000001000000358024) y el stock sin ellos (1000000358024). Deben normalizar
  // al mismo SKU para que la venta cruce con el stock.
  it('quita los ceros a la izquierda del SKU numérico', () => {
    const buf = csvBuffer(
      [
        'FECHA,CODIGO_VARIANTE,TIENDA,Cant Act',
        '13/06/2026,000001000000358024,El Sol,5',
        '13/06/2026,AB-0090,El Sol,2',
      ].join('\n'),
    );
    const { rows } = parseSalesDaily(buf);
    expect(rows[0].sku).toBe('1000000358024');
    expect(rows[1].sku).toBe('AB-0090'); // alfanumérico: intacto
  });
});

describe('parseStock', () => {
  it('lee stock total con alias existencia', () => {
    const buf = xlsxBuffer([
      ['sku', 'existencia'],
      ['A1', 20],
    ]);
    const { rows } = parseStock(buf);
    expect(rows[0]).toEqual({ sku: 'A1', total_units: 20 });
  });
});
