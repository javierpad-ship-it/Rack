// Cálculo de semana ISO en formato 'IYYY-"W"IW' (ej. 2026-W26).
// DEBE coincidir con la función iso_week() de supabase/migrations/0002_attribution.sql.

export function isoWeek(date: Date = new Date()): string {
  // Copia en UTC para evitar desfases por zona horaria.
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  // ISO: el jueves de la semana define el año.
  const dayNum = (d.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  d.setUTCDate(d.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  const week =
    1 + Math.round((d.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
  return `${d.getUTCFullYear()}-W${String(week).padStart(2, '0')}`;
}

// Semana previa a una semana ISO dada (para comparativas semana a semana).
export function previousIsoWeek(week: string): string {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return week;
  const year = Number(m[1]);
  const wk = Number(m[2]);
  if (wk > 1) return `${year}-W${String(wk - 1).padStart(2, '0')}`;
  // Semana 1 -> última semana del año anterior (52 o 53). Aproximamos con dic 28.
  return isoWeek(new Date(Date.UTC(year - 1, 11, 28)));
}
