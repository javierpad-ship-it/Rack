import Link from 'next/link';
import { createClient } from '@/lib/supabase/server';
import { getCurrentStore } from '@/lib/currentStore';
import { money, fmtDate, type VariantLookup } from '@/lib/types';

export const dynamic = 'force-dynamic';

const SWATCH: Record<string, string> = {
  azul: '#3b6fd6', negro: '#1c2540', rojo: '#c0392b', blanco: '#e5e7eb',
  verde: '#2e8b57', gris: '#6b7280', marron: '#8b5e3c', beige: '#d8c3a5',
};
function swatch(color: string) {
  // NFD + quitar todo lo que no sea a-z deja la clave sin acentos (marrón→marron).
  const k = color.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '');
  return SWATCH[k] ?? '#93a2c6';
}

// Semáforo de rotación (IRP del genérico, cadena) — 5 tramos.
function rotBand(irp: number): { bg: string; fg: string; label: string } {
  if (irp > 30) return { bg: '#2E9E44', fg: '#ffffff', label: 'Rotación alta' };
  if (irp >= 25) return { bg: '#8FD694', fg: '#14421c', label: 'Rotación buena' };
  if (irp >= 20) return { bg: '#B8860B', fg: '#ffffff', label: 'Rotación media' }; // ámbar oscuro
  if (irp >= 15) return { bg: '#FF8C00', fg: '#ffffff', label: 'Rotación baja' };  // naranja
  return { bg: '#C0392B', fg: '#ffffff', label: 'Rotación crítica' };             // rojo
}

export default async function FichaPage({ params }: { params: { sku: string } }) {
  const sku = decodeURIComponent(params.sku);
  const store = await getCurrentStore();
  const supabase = createClient();
  const { data, error } = await supabase.rpc('prisma_variant_lookup', {
    p_store_id: store!.id,
    p_sku: sku,
  });
  const r = data as VariantLookup | null;

  return (
    <main className="app">
      <div className="appbar">
        <Link href="/" className="back">←</Link>
        <div>
          <h1>{r?.variante?.description ?? 'Producto'}</h1>
          <div className="sub">
            {[r?.variante?.article_code, r?.variante?.gender, r?.variante?.mundo].filter(Boolean).join(' · ') || sku}
          </div>
        </div>
        <Link href="/tienda" className="store-chip">📍 {store?.name ?? ''} ▾</Link>
      </div>

      <div className="body">
        {error && <div className="card">Error al consultar: {error.message}</div>}
        {!error && !r?.found && (
          <div className="card">
            <div className="eyebrow">Sin datos</div>
            <p className="mini">No encontramos la variante <b>{sku}</b> en {store?.name}. Verifica el código o la tienda.</p>
            <Link href="/" className="btn ghost">Volver a escanear</Link>
          </div>
        )}

        {r?.found && (
          <>
            <div className="card">
              <div className="row"><span className="eyebrow">Producto</span><span className="pill vig">VIGENTE</span></div>
              <div style={{ fontWeight: 800, fontSize: 17 }}>
                {r.variante.description}{r.variante.color || r.variante.talla ? ` — ${[r.variante.color, r.variante.talla].filter(Boolean).join(' / ')}` : ''}
              </div>
              <div className="codes">
                {r.variante.generic_code && <span className="code">Genérico {r.variante.generic_code}</span>}
                {r.variante.article_code && <span className="code">Artículo {r.variante.article_code}</span>}
                <span className="code">Variante {r.variante.sku}</span>
              </div>
            </div>

            <div className="card">
              {r.empresa_id ? (
                <div className="price-grid">
                  <div className="price-main">
                    <div><div className="eyebrow">PVP vigente {r.empresa_nombre ? `· ${r.empresa_nombre}` : ''}</div>
                      <div className="v tnum">{money(r.precio?.pvp_vigente)}</div></div>
                  </div>
                  <div className="kpi"><div className="l">PVP anterior</div><div className="n tnum" style={{ fontSize: 18 }}>{money(r.precio?.pvp_anterior)}</div></div>
                  <div className="kpi"><div className="l">Último cambio</div><div className="n tnum" style={{ fontSize: 18 }}>{fmtDate(r.precio?.fecha_cambio)}</div></div>
                </div>
              ) : (
                <p className="mini">Esta tienda no tiene una empresa asignada; pedile a un admin que la configure en Rack One → Tiendas para ver el PVP.</p>
              )}
            </div>

            <div
              className="card"
              style={{
                background: rotBand(r.rotacion).bg,
                color: rotBand(r.rotacion).fg,
                textAlign: 'center',
                padding: '14px 16px',
              }}
            >
              <div className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>
                Rotación del genérico (cadena, 30 d)
              </div>
              <div style={{ fontWeight: 800, fontSize: 30, lineHeight: 1.2 }}>{r.rotacion}%</div>
              <div className="mini" style={{ color: 'inherit', opacity: 0.9 }}>{rotBand(r.rotacion).label}</div>
            </div>

            <div className="card">
              <div className="eyebrow" style={{ marginBottom: 10 }}>Variante escaneada — en esta tienda</div>
              <div className="kpi-row">
                <div className="kpi"><div className="n tnum">{r.stock_variante}</div><div className="l">Stock (Stk Fin)</div></div>
                <div className="kpi"><div className="n tnum">{r.piso} · {r.almacen}</div><div className="l">Piso · Almacén</div></div>
                <div className="kpi"><div className="n tnum">{r.vendido}</div><div className="l">Vendido {r.vendido_dias} d</div></div>
              </div>
            </div>

            <div>
              <div className="eyebrow" style={{ margin: '2px 2px 8px' }}>Detalle del genérico (por color)</div>
              {(r.por_color ?? []).map((g, i) => (
                <details className="acc" key={g.color} open={i === 0}>
                  <summary>
                    <span className="sw" style={{ background: swatch(g.color) }} /> {g.color}
                    <span className="cnt">{g.stock} u.</span>
                  </summary>
                  <div className="acc-body">
                    <table className="matrix">
                      <thead><tr><th>Talla</th><th>Stock</th><th>Alm</th><th>Piso</th><th>Vta {r.vendido_dias}d</th></tr></thead>
                      <tbody className="tnum">
                        {g.tallas.map((t) => (
                          <tr key={t.sku} className={t.hit ? 'hit' : ''}>
                            <td>{t.talla ?? '—'}{t.hit && <span className="tag-hit">ESCANEADA</span>}</td>
                            <td>{t.stock}</td><td>{t.almacen}</td><td>{t.piso}</td><td>{t.vta30}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </details>
              ))}
            </div>

            {r.propuesta_pendiente.length > 0 && (
              <div className="card" style={{ background: '#FFF3CD', color: '#5a4600' }}>
                <div className="eyebrow" style={{ color: 'inherit', opacity: 0.85 }}>
                  {r.propuesta_pendiente.length === 1
                    ? 'Ya hay una propuesta de precio en trámite'
                    : `Ya hay ${r.propuesta_pendiente.length} propuestas de precio en trámite`}
                </div>
                {r.propuesta_pendiente.map((p) => (
                  <div key={p.id} className="row" style={{ justifyContent: 'space-between', marginTop: 4 }}>
                    <span className="mini">{p.tienda ?? '—'} · {p.solicitante ?? '—'} · {new Date(p.created_at).toLocaleDateString('es-PE')}</span>
                    <b className="tnum">{money(p.proposed_pvp)}</b>
                  </div>
                ))}
                <div className="mini" style={{ marginTop: 6, opacity: 0.85 }}>
                  Si igual creés que hace falta otro precio, podés proponerlo — el responsable de línea decide cuál queda.
                </div>
              </div>
            )}

            <Link className="btn primary" href={`/proponer/${encodeURIComponent(r.variante.generic_code ?? '')}?sku=${encodeURIComponent(r.variante.sku)}`}>
              Proponer nuevo precio
            </Link>
            <Link className="btn ghost" href="/">Nueva consulta</Link>
          </>
        )}
      </div>
    </main>
  );
}
