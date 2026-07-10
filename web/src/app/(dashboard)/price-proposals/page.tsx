'use client';

import { useEffect, useState, useCallback } from 'react';
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

      <div style={{ overflowX: 'auto' }}>
        <table className="panel" style={{ minWidth: 980 }}>
          <thead>
            <tr>
              <th>Genérico</th><th>Solicitante</th><th>Tienda</th>
              <th>PVP vig.</th><th>Propuesto</th><th>Costo prom.</th>
              <th>Stk tienda</th><th>Rot. tienda</th>
              <th>Stk cadena</th><th>Rot. cadena</th>
              {status === 'pendiente' && <th>Acciones</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{r.generic_code}</td>
                <td>{r.solicitante ?? '—'}</td>
                <td>{r.tienda ?? '—'}</td>
                <td>{money(r.current_pvp)}</td>
                <td>{money(r.proposed_pvp)}</td>
                <td>{money(r.costo_prom)}</td>
                <td>{r.stock_tienda}</td>
                <td>{r.rot_tienda}%</td>
                <td>{r.stock_cadena}</td>
                <td>{r.rot_cadena}%</td>
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
              <tr><td colSpan={11} className="muted">Sin propuestas en este estado.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
