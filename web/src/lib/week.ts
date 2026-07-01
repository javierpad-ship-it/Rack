// Semana COMERCIAL (domingo→sábado), formato 'YYYY-Www' (ej. 2026-W01).
// DEBE coincidir con comm_week() de supabase/migrations/0014_commercial_week.sql.
// La Semana 1 de cada año arranca el domingo de la semana que contiene el 1/1
// (semilla por defecto; el administrador puede anclarla a mano por año en la
// pantalla Calendario, y el servidor recalcula con esa config).

function utc(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

// Domingo (dow=0) en que empieza la semana 1 del año comercial `year` (regla por defecto).
function week1Start(year: number): Date {
  const jan1 = utc(year, 0, 1);
  const dow = jan1.getUTCDay(); // 0=domingo ... 6=sábado
  jan1.setUTCDate(jan1.getUTCDate() - dow);
  return jan1;
}

const DAY = 24 * 3600 * 1000;

// Etiqueta de semana comercial de una fecha.
export function isoWeek(date: Date = new Date()): string {
  const d = utc(date.getFullYear(), date.getMonth(), date.getDate());
  const y = d.getUTCFullYear();
  // Elegir el año cuyo inicio de Semana 1 es el mayor <= d (cubre el borde de fin de año).
  let year = y;
  let start = week1Start(y);
  for (const cand of [y + 1, y - 1]) {
    const cs = week1Start(cand);
    if (cs.getTime() <= d.getTime() && cs.getTime() > start.getTime()) {
      start = cs;
      year = cand;
    }
  }
  if (week1Start(y).getTime() > d.getTime()) {
    // d cae antes del inicio de su propio año => pertenece al año anterior.
    year = y - 1;
    start = week1Start(y - 1);
  }
  const no = Math.floor((d.getTime() - start.getTime()) / (7 * DAY)) + 1;
  return `${year}-W${String(no).padStart(2, '0')}`;
}

// Alias explícito por claridad.
export const commWeek = isoWeek;

// Mes calendario 'YYYY-MM' (para la proyección mensual).
export function currentMonth(date: Date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

// Semana previa a una etiqueta 'YYYY-Www' (para comparativas semana a semana).
export function previousIsoWeek(week: string): string {
  const m = week.match(/^(\d{4})-W(\d{2})$/);
  if (!m) return week;
  const year = Number(m[1]);
  const wk = Number(m[2]);
  if (wk > 1) return `${year}-W${String(wk - 1).padStart(2, '0')}`;
  // Semana 1 -> última semana del año anterior: la semana del sábado previo al inicio.
  const prevSat = new Date(week1Start(year).getTime() - DAY);
  return isoWeek(prevSat);
}
