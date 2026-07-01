'use client';

import { useEffect, useState, useCallback } from 'react';
import { listWeekCalendar, upsertWeekYear, type WeekYear } from './actions';

export default function CalendarPage() {
  const [rows, setRows] = useState<WeekYear[]>([]);
  const [year, setYear] = useState(new Date().getFullYear());
  const [start, setStart] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await listWeekCalendar();
    if (res.ok) setRows(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    const res = await upsertWeekYear(year, start);
    if (!res.ok) {
      setError(res.error);
      return;
    }
    setMsg(`Año ${year} guardado.`);
    setStart('');
    load();
  }

  return (
    <div>
      <span className="eyebrow">Mantenimiento</span>
      <h1>Calendario comercial</h1>
      <p className="muted">
        La semana es <b>domingo a sábado</b>. Definí el <b>domingo</b> en que empieza la Semana 1 de
        cada año. Cargá cada año para que los bordes (semana 52/53) queden bien.
      </p>

      <form className="panel row" onSubmit={save} style={{ marginBottom: 16 }}>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Año
          <input
            type="number"
            min={2000}
            max={2100}
            value={year}
            onChange={(e) => setYear(Number(e.target.value))}
            style={{ width: 90 }}
            required
          />
        </label>
        <label className="muted" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          Inicio Semana 1 (domingo)
          <input type="date" value={start} onChange={(e) => setStart(e.target.value)} required />
        </label>
        <button>Guardar</button>
        {msg && <span className="pos">{msg}</span>}
        {error && <span className="neg">{error}</span>}
      </form>

      <table className="panel">
        <thead>
          <tr>
            <th>Año</th>
            <th>Inicio Semana 1</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.year}>
              <td>{r.year}</td>
              <td>{r.week1_start}</td>
              <td>
                <button
                  className="secondary"
                  onClick={() => {
                    setYear(r.year);
                    setStart(r.week1_start);
                  }}
                >
                  Editar
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={3} className="muted">
                Sin años configurados.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
