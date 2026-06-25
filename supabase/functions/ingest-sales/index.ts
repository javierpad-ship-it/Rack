// ============================================================================
// Rack — Edge Function: ingesta de ventas (plantilla de adaptador POS)
// POS-agnóstica: el adaptador concreto se elige según integrations.kind.
//
// Flujo:
//   1. Recibe { store_id, week, source? } (POST) — o lo dispara pg_cron/Scheduler.
//   2. Obtiene la config de `integrations` de esa tienda.
//   3. Llama al adaptador del POS para traer las líneas de venta crudas.
//   4. Crea un `ingest_runs`, vuelca a `sales_staging` y normaliza con process_sales_staging().
//
// Desplegar: supabase functions deploy ingest-sales
// Requiere secrets: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY (los provee la plataforma).
// ============================================================================

import { createClient } from 'jsr:@supabase/supabase-js@2';

interface RawSale {
  code: string;   // código del producto tal cual viene del POS
  units: number;
  amount: number;
}

// --- Adaptadores por tipo de POS. Implementar el real del cliente aquí. ---
type PosAdapter = (config: Record<string, unknown>, week: string) => Promise<RawSale[]>;

const adapters: Record<string, PosAdapter> = {
  // Ejemplo REST: GET {baseUrl}/sales?week=... con Bearer token. Ajustar al POS real.
  pos_rest: async (config, week) => {
    const baseUrl = String(config.baseUrl ?? '');
    const token = String(config.token ?? '');
    if (!baseUrl) throw new Error('integrations.config.baseUrl no configurado');
    const res = await fetch(`${baseUrl}/sales?week=${encodeURIComponent(week)}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    if (!res.ok) throw new Error(`POS respondió ${res.status}`);
    const data = await res.json();
    // Mapear el formato del POS a RawSale. Placeholder genérico:
    return (data.items ?? []).map((x: Record<string, unknown>) => ({
      code: String(x.sku ?? x.code ?? ''),
      units: Number(x.units ?? x.qty ?? 0),
      amount: Number(x.amount ?? x.total ?? 0),
    }));
  },
};

Deno.serve(async (req: Request) => {
  try {
    const { store_id, week, source } = await req.json();
    if (!store_id || !week) {
      return json({ error: 'store_id y week son requeridos' }, 400);
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Config de integración
    const { data: integ } = await supabase
      .from('integrations')
      .select('kind, config')
      .eq('store_id', store_id)
      .eq('active', true)
      .maybeSingle();

    const kind = integ?.kind ?? source ?? 'pos_rest';
    const adapter = adapters[kind];
    if (!adapter) return json({ error: `Sin adaptador para '${kind}'` }, 400);

    // Abrir corrida
    const { data: run } = await supabase
      .from('ingest_runs')
      .insert({ store_id, kind: 'sales', source: kind, week, status: 'running' })
      .select('id')
      .single();
    const runId = run!.id;

    try {
      const raw = await adapter(integ?.config ?? {}, week);
      if (raw.length > 0) {
        await supabase.from('sales_staging').insert(
          raw.map((r) => ({
            run_id: runId,
            store_id,
            week,
            raw_code: r.code,
            units: r.units,
            amount: r.amount,
          })),
        );
      }
      // Normaliza staging -> sales (resuelve alias) y dispara atribución.
      await supabase.rpc('process_sales_staging', { p_run_id: runId });

      await supabase
        .from('ingest_runs')
        .update({ status: 'ok', rows_in: raw.length, rows_ok: raw.length, finished_at: new Date().toISOString() })
        .eq('id', runId);
      await supabase.from('integrations').update({ last_run_at: new Date().toISOString() }).eq('store_id', store_id);

      return json({ ok: true, run_id: runId, rows: raw.length });
    } catch (e) {
      await supabase
        .from('ingest_runs')
        .update({ status: 'error', detail: { message: String(e) }, finished_at: new Date().toISOString() })
        .eq('id', runId);
      throw e;
    }
  } catch (e) {
    return json({ error: String(e) }, 500);
  }
});

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
