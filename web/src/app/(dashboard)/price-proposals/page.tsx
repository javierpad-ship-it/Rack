'use client';

import { useEffect, useState, useCallback, type CSSProperties } from 'react';
import {
  listProposals, acceptProposal, denyProposal, counterProposal,
  type ProposalRow, type ProposalStatus,
} from './actions';

const STATUSES: { value: ProposalStatus; label: string }[] = [
  { value: 'pendiente', label: 'Pendientes' },
  { value: 'aceptada', label: 'Aceptadas' },
  { value: 'denegada', label: 'Denegadas' },
  { value: 'contrapropuesta', label: 'Contrapropuestas' },
];

function money(v: number | null) {
  if (v == null) return '—';
  return v.toLocaleString('es-PE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

// Columnas de rotación resaltadas en celeste (fondo suave + texto acento) para
// distinguirlas del resto de la tabla de un vistazo.
const ROT_BG = '#E7F4FB';
const ROT_FG = '#0E7BA8';

// Encabezado congelado: fondo sólido (igual al panel) para que no se transparente
// el contenido al hacer scroll, con un borde para separarlo visualmente. El
// sticky necesita que el ANCESTRO que scrollea tenga overflow-y acotado (ver
// el div con maxHeight/overflow:auto más abajo) — con overflowX:auto solo, sin
// altura máxima, el navegador nunca crea una caja de scroll real y el
// encabezado no llega a "flotar".
const stickyTh: CSSProperties = {
  position: 'sticky', top: 0, zIndex: 1,
  background: 'var(--surface)', borderBottom: '2px solid var(--border)',
};

export default function PriceProposalsPage() {
  const [status, setStatus] = useState<ProposalStatus>('pendiente');
  const [rows, setRows] = useState<ProposalRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(async (s: ProposalStatus) => {
    const res = await listProposals(s);
    if (res.ok) setRows(res.data);
    else setError(res.error);
  }, []);

  useEffect(() => { load(status); }, [status, load]);

  async function onAccept(r: ProposalRow) {
    setBusyId(r.id); setError(null);
    const res = await acceptProposal(r.id, r.proposed_pvp);
    setBusyId(null);
    if (!res.ok) setError(res.error); else load(status);
  }
  async function onDeny(r: ProposalRow) {
    const note = prompt('Motivo de la denegación (opcional):') ?? undefined;
    setBusyId(r.id); setError(null);
    const res = await denyProposal(r.id, note);
    setBusyId(null);
    if (!res.ok) setError(res.error); else load(status);
  }
  async function onCounter(r: ProposalRow) {
    const v = prompt('Contrapropuesta — nuevo PVP (S/):', String(r.proposed_pvp));
    if (v == null) return;
    const num = parseFloat(v.replace(',', '.'));
    if (!(num > 0)) { setError('Precio inválido.'); return; }
    const note = prompt('Nota para el solicitante (opcional):') ?? undefined;
    setBusyId(r.id); setError(null);
    const res = await counterProposal(r.id, num, note);
    setBusyId(null);
    if (!res.ok) setError(res.error); else load(status);
  }

  return (
    <div>
      <h1>Propuestas de precio</h1>
      <p className="muted">Flujo de propuestas desde Prisma. Rotación = IRP (ventas / (ventas+stock) × 100), 30 días.</p>

      <div className="row" style={{ margin: '12px 0', gap: 10 }}>
        <select value={status} onChange={(e) => setStatus(e.target.value as ProposalStatus)}>
          {STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        {error && <span className="neg">{error}</span>}
      </div>

      {/* Wrapper con la tarjeta (panel) sin padding para que el borde/sombra no
          se corte; el scroll real (X e Y, acotado) va en el div de adentro, que
          es el ancestro sticky del thead. */}
      <div className="panel" style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ maxHeight: '65vh', overflow: 'auto' }}>
          <table style={{ minWidth: 1320, width: '100%' }}>
            <thead>
              <tr>
                <th style={stickyTh}>Genérico</th>
                <th style={stickyTh}>Descripción</th>
                <th style={stickyTh}>Género</th>
                <th style={stickyTh}>Mundo</th>
                <th style={stickyTh}>Marca</th>
                <th style={stickyTh}>Solicitante</th><th style={stickyTh}>Tienda</th>
                <th style={stickyTh}>PVP vig.</th><th style={stickyTh}>Propuesto</th><th style={stickyTh}>Costo prom.</th>
                <th style={stickyTh}>Stk tienda</th><th style={{ ...stickyTh, background: ROT_BG, color: ROT_FG }}>Rot. tienda</th>
                <th style={stickyTh}>Stk cadena</th><th style={{ ...stickyTh, background: ROT_BG, color: ROT_FG }}>Rot. cadena</th>
                {status === 'pendiente' && <th style={stickyTh}>Acciones</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>{r.generic_code}</td>
                  <td>{r.descripcion ?? <span className="muted">—</span>}</td>
                  <td>{r.genero ?? <span className="muted">—</span>}</td>
                  <td>{r.mundo ?? <span className="muted">—</span>}</td>
                  <td>{r.marca ?? <span className="muted">—</span>}</td>
                  <td>{r.solicitante ?? '—'}</td>
                  <td>{r.tienda ?? '—'}</td>
                  <td>{money(r.current_pvp)}</td>
                  <td>{money(r.proposed_pvp)}</td>
                  <td>{money(r.costo_prom)}</td>
                  <td>{r.stock_tienda}</td>
                  <td style={{ background: ROT_BG, color: ROT_FG, fontWeight: 600 }}>{r.rot_tienda}%</td>
                  <td>{r.stock_cadena}</td>
                  <td style={{ background: ROT_BG, color: ROT_FG, fontWeight: 600 }}>{r.rot_cadena}%</td>
                  {status === 'pendiente' && (
                    <td>
                      <div className="row" style={{ gap: 6 }}>
                        <button className="secondary" disabled={busyId === r.id} onClick={() => onAccept(r)}>Aceptar</button>
                        <button className="secondary neg" disabled={busyId === r.id} onClick={() => onDeny(r)}>Denegar</button>
                        <button className="secondary" disabled={busyId === r.id} onClick={() => onCounter(r)}>Contra…</button>
                      </div>
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={status === 'pendiente' ? 15 : 14} className="muted">Sin propuestas en este estado.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
