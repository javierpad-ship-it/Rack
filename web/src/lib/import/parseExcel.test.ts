import { describe, it, expect } from 'vitest';
import * as XLSX from 'xlsx';
import { parseCatalog, parseSales, parseStock } from './parseExcel';

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
