'use client';

import { useState, useTransition } from 'react';
import { money } from '@/lib/types';
import { createProposal } from './actions';

export default function ProposeForm({
  generic,
  sku,
  currentPvp,
  salesOrg,
}: {
  generic: string;
  sku: string | null;
  currentPvp: number | null;
  salesOrg: string | null;
}) {
  const [newPvp, setNewPvp] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const proposed = parseFloat(newPvp.replace(',', '.'));
  const delta =
    currentPvp && proposed > 0 ? Math.round(((proposed - currentPvp) / currentPvp) * 100) : null;

  function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!(proposed > 0)) { setError('Ingresa un PVP válido.'); return; }
    start(async () => {
      const res = await createProposal({
        generic_code: generic,
        sku,
        current_pvp: currentPvp,
        proposed_pvp: proposed,
        reason,
      });
      if (res && !res.ok) setError(res.error);
    });
  }

  return (
    <form onSubmit={submit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="card tint">
        <div className="row"><span className="muted">Genérico</span><b>{generic}</b></div>
        <div className="row"><span className="muted">PVP vigente</span><b className="tnum">{money(currentPvp)}</b></div>
        <div className="row"><span className="muted">Org. de Ventas</span><span className="pill vig">{salesOrg ?? '—'}</span></div>
      </div>

      <div>
        <label className="field" htmlFor="newp">Nuevo PVP propuesto</label>
        <span className="input">
          <span className="muted" style={{ fontWeight: 800 }}>S/</span>
          <input id="newp" inputMode="decimal" placeholder="0.00" value={newPvp} onChange={(e) => setNewPvp(e.target.value)} required />
        </span>
      </div>

      <div>
        <label className="field" htmlFor="motivo">Motivo</label>
        <span className="input">
          <input id="motivo" placeholder="Ej. baja rotación, competencia, liquidación" value={reason} onChange={(e) => setReason(e.target.value)} />
        </span>
      </div>

      {delta != null && (
        <div className="card tint">
          <div className="row">
            <span className="muted">{delta < 0 ? 'Reducción' : 'Aumento'}</span>
            <b className="tnum" style={{ color: delta < 0 ? 'var(--warn)' : 'var(--ok)' }}>
              {delta > 0 ? '+' : ''}{delta}% · {money(Math.abs((currentPvp ?? 0) - proposed))}
            </b>
          </div>
          <div className="mini">La revisará el responsable de línea en Rack One.</div>
        </div>
      )}

      {error && <p className="neg" style={{ color: 'var(--bad)' }}>{error}</p>}

      <button className="btn primary" disabled={pending}>{pending ? 'Enviando…' : 'Enviar propuesta'}</button>
    </form>
  );
}
