import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isoWeek } from '@/lib/week';
import type { Store } from '@/lib/types';

export default async function DashboardHome() {
  const supabase = createClient();
  // Semana vigente autoritativa (calendario comercial del servidor).
  const { data: currentWeek } = await supabase.rpc('current_comm_week');
  const week = (currentWeek as string) ?? isoWeek();
  // Última semana efectivamente escaneada.
  const { data: lastScan } = await supabase
    .from('scan_sessions')
    .select('week')
    .order('week', { ascending: false })
    .limit(1)
    .maybeSingle();
  const lastScannedWeek = (lastScan?.week as string | undefined) ?? '—';

  const { count: storeCount } = await supabase
    .from('stores')
    .select('*', { count: 'exact', head: true });
  const { count: fixtureCount } = await supabase
    .from('fixtures')
    .select('*', { count: 'exact', head: true });
  const { count: sessionsThisWeek } = await supabase
    .from('scan_sessions')
    .select('*', { count: 'exact', head: true })
    .eq('week', week);

  // Cobertura por tienda: muebles activos vs muebles escaneados esta semana.
  const [{ data: stores }, { data: activeFixtures }, { data: weekSessions }] = await Promise.all([
    supabase.from('stores').select('id, code, name').order('name'),
    supabase.from('fixtures').select('id, store_id').eq('active', true),
    supabase.from('scan_sessions').select('store_id, fixture_id').eq('week', week),
  ]);

  const activeByStore = new Map<string, number>();
  (activeFixtures ?? []).forEach((f) => {
    activeByStore.set(f.store_id, (activeByStore.get(f.store_id) ?? 0) + 1);
  });
  const scannedByStore = new Map<string, Set<string>>();
  (weekSessions ?? []).forEach((s) => {
    if (!scannedByStore.has(s.store_id)) scannedByStore.set(s.store_id, new Set());
    scannedByStore.get(s.store_id)!.add(s.fixture_id);
  });

  const coverage = ((stores ?? []) as Store[]).map((s) => {
    const total = activeByStore.get(s.id) ?? 0;
    const done = scannedByStore.get(s.id)?.size ?? 0;
    return { store: s, done, total, pct: total ? Math.round((done / total) * 100) : 0 };
  });

  const cards = [
    { label: 'Tiendas', value: storeCount ?? 0 },
    { label: 'Muebles', value: fixtureCount ?? 0 },
    { label: `Escaneos (${week})`, value: sessionsThisWeek ?? 0 },
  ];

  return (
    <div>
      <span className="eyebrow">Semana vigente {week} · Última escaneada {lastScannedWeek}</span>
      <h1>Resumen</h1>
      <div className="row">
        {cards.map((c) => (
          <div key={c.label} className="panel stat-card">
            <div className="muted">{c.label}</div>
            <div className="stat-num">{c.value}</div>
          </div>
        ))}
      </div>

      <h2 style={{ marginTop: 24 }}>Cobertura de escaneo · {week}</h2>
      <table className="panel">
        <thead>
          <tr>
            <th>Tienda</th>
            <th>Escaneados</th>
            <th>Avance</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {coverage.map((c) => (
            <tr key={c.store.id}>
              <td>{c.store.name}</td>
              <td>
                {c.done}/{c.total}
              </td>
              <td>
                <div className="track" style={{ width: 160, height: 12 }}>
                  <span
                    className={c.pct >= 100 ? 'done' : undefined}
                    style={{ width: `${c.pct}%` }}
                  />
                </div>
              </td>
              <td className="muted">
                {c.pct}% · <Link href="/coverage">ver</Link>
              </td>
            </tr>
          ))}
          {coverage.length === 0 && (
            <tr>
              <td colSpan={4} className="muted">
                Sin tiendas visibles.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
