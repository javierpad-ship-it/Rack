import { createClient } from '@/lib/supabase/server';
import { isoWeek } from '@/lib/week';

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
    </div>
  );
}
