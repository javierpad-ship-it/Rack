import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { isoWeek } from '@/lib/week';
import type { Store } from '@/lib/types';

export default async function DashboardHome() {
  const supabase = createClient();
  const week = isoWeek();

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
      <h1>Resumen</h1>
      <p className="muted">Semana actual: {week}</p>
      <div className="row">
        {cards.map((c) => (
          <div key={c.label} className="panel" style={{ minWidth: 180 }}>
            <div className="muted">{c.label}</div>
            <div style={{ fontSize: 32, fontWeight: 700 }}>{c.value}</div>
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
                <div
                  style={{
                    background: '#11141a',
                    borderRadius: 6,
                    overflow: 'hidden',
                    width: 160,
                    height: 14,
                  }}
                >
                  <div
                    style={{
                      width: `${c.pct}%`,
                      height: '100%',
                      background: c.pct >= 100 ? '#6bdc7a' : 'var(--accent)',
                    }}
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
