'use client';

import type { Fixture, StoreLayout } from '@/lib/types';

interface Metric {
  fixture_id: string;
  amount_now: number;
}

// Mapa de calor: pinta cada mueble sobre el plano con color según su venta (amount_now).
export default function Heatmap({
  layout,
  fixtures,
  metrics,
}: {
  layout: StoreLayout | null;
  fixtures: Fixture[];
  metrics: Metric[];
}) {
  if (!layout?.image_url) {
    return <p className="muted">Esta tienda no tiene plano cargado.</p>;
  }

  const byFixture = new Map(metrics.map((m) => [m.fixture_id, m.amount_now]));
  const max = Math.max(1, ...metrics.map((m) => m.amount_now));

  // Escala de color azul (frío) -> rojo (caliente).
  function color(amount: number): string {
    const t = Math.min(1, amount / max);
    const hue = (1 - t) * 220; // 220=azul, 0=rojo
    return `hsl(${hue}, 85%, 50%)`;
  }

  const placed = fixtures.filter((f) => f.pin_x != null && f.pin_y != null);

  return (
    <div className="panel">
      <div style={{ position: 'relative', display: 'inline-block' }}>
        <img src={layout.image_url} alt="Plano" style={{ maxWidth: '100%', display: 'block' }} />
        {placed.map((f) => {
          const amount = byFixture.get(f.id) ?? 0;
          return (
            <span
              key={f.id}
              title={`${f.name}: S/ ${(Number(amount) || 0).toLocaleString('es-PE')}`}
              style={{
                position: 'absolute',
                left: `${(f.pin_x as number) * 100}%`,
                top: `${(f.pin_y as number) * 100}%`,
                transform: 'translate(-50%, -50%)',
                width: 26,
                height: 26,
                borderRadius: '50%',
                background: color(amount),
                opacity: 0.85,
                border: '2px solid rgba(255,255,255,0.8)',
              }}
            />
          );
        })}
      </div>
      <p className="muted" style={{ fontSize: 12 }}>
        Color por venta de la semana (azul = menor, rojo = mayor). Máximo: $
        {(Number(max) || 0).toLocaleString('es-PE')}.
      </p>
    </div>
  );
}
