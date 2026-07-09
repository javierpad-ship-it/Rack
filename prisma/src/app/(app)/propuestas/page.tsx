import { createClient } from '@/lib/supabase/server';
import { money } from '@/lib/types';

export const dynamic = 'force-dynamic';

type Row = {
  id: number;
  generic_code: string;
  current_pvp: number | null;
  proposed_pvp: number;
  decided_pvp: number | null;
  status: 'pendiente' | 'aceptada' | 'denegada' | 'contrapropuesta';
  review_note: string | null;
  reviewed_at: string | null;
  created_at: string;
  seen_by_requester_at: string | null;
};

const PILL: Record<Row['status'], { cls: string; label: string }> = {
  pendiente: { cls: 'pend', label: 'Pendiente' },
  aceptada: { cls: 'ok', label: 'Aceptada' },
  denegada: { cls: 'bad', label: 'Denegada' },
  contrapropuesta: { cls: 'warn', label: 'Contrapropuesta' },
};

export default async function PropuestasPage() {
  const supabase = createClient();
  const { data } = await supabase
    .from('price_proposals')
    .select('id, generic_code, current_pvp, proposed_pvp, decided_pvp, status, review_note, reviewed_at, created_at, seen_by_requester_at')
    .order('created_at', { ascending: false });
  const rows = (data ?? []) as Row[];

  const unseen = rows.filter((r) => r.status !== 'pendiente' && !r.seen_by_requester_at);
  if (unseen.length) {
    await supabase
      .from('price_proposals')
      .update({ seen_by_requester_at: new Date().toISOString() })
      .in('id', unseen.map((r) => r.id));
  }

  return (
    <main className="app">
      <div className="appbar">
        <div>
          <h1>Mis propuestas</h1>
          <div className="sub">Cómo se procesaron tus pedidos</div>
        </div>
        {unseen.length > 0 && <span className="store-chip">🔔 {unseen.length} nuevas</span>}
      </div>
      <div className="body">
        {rows.length === 0 && (
          <div className="empty">Aún no has enviado propuestas.<br />Escanea un producto y propón un precio.</div>
        )}
        {rows.map((r) => {
          const p = PILL[r.status];
          return (
            <div className="prop" key={r.id}>
              <div className="top">
                <span className="mv">{r.generic_code}</span>
                <span className={`pill ${p.cls}`}>{p.label}</span>
              </div>
              <div className="row mini">
                <span className="tnum">{money(r.current_pvp)} → {money(r.proposed_pvp)}</span>
                <span>{new Date(r.created_at).toLocaleDateString('es-PE')}</span>
              </div>
              {r.status === 'contrapropuesta' && r.decided_pvp != null && (
                <div className="mini">Aprobado a <b className="tnum">{money(r.decided_pvp)}</b>{r.review_note ? ` — "${r.review_note}"` : ''}.</div>
              )}
              {r.status === 'denegada' && r.review_note && <div className="mini">&quot;{r.review_note}&quot;</div>}
            </div>
          );
        })}
      </div>
    </main>
  );
}
