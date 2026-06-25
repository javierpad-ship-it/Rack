import { describe, it, expect } from 'vitest';
import { isoWeek, previousIsoWeek } from './week';

describe('isoWeek', () => {
  it('calcula la semana ISO con formato IYYY-Www', () => {
    // 2026-06-25 (jueves) -> semana ISO 26
    expect(isoWeek(new Date(Date.UTC(2026, 5, 25)))).toBe('2026-W26');
  });

  it('asigna fin de año a la semana correcta', () => {
    // 2025-12-29 (lunes) pertenece a la semana 1 de 2026 (ISO)
    expect(isoWeek(new Date(Date.UTC(2025, 11, 29)))).toBe('2026-W01');
  });

  it('1 de enero puede pertenecer a la última semana del año previo', () => {
    // 2027-01-01 (viernes) -> semana 53 de 2026 (ISO)
    expect(isoWeek(new Date(Date.UTC(2027, 0, 1)))).toBe('2026-W53');
  });
});

describe('previousIsoWeek', () => {
  it('resta una semana dentro del año', () => {
    expect(previousIsoWeek('2026-W26')).toBe('2026-W25');
  });

  it('cruza al año anterior desde la semana 1', () => {
    expect(previousIsoWeek('2026-W01')).toBe('2025-W52');
  });
});
