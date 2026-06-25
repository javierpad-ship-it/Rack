import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

// Diagnóstico: indica qué variables ve el servidor en runtime, sin
// revelar los valores. Útil para verificar la config de despliegue.
export function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

  return NextResponse.json({
    ok: Boolean(url && anonKey),
    env: {
      NEXT_PUBLIC_SUPABASE_URL: {
        present: Boolean(url),
        looksLikeUrl: url.startsWith('https://') && url.includes('.supabase.co'),
        preview: url ? `${url.slice(0, 16)}…(${url.length})` : null,
      },
      NEXT_PUBLIC_SUPABASE_ANON_KEY: {
        present: Boolean(anonKey),
        looksLikeKey: anonKey.startsWith('sb_publishable_') || anonKey.startsWith('eyJ'),
        preview: anonKey ? `${anonKey.slice(0, 10)}…(${anonKey.length})` : null,
      },
      SUPABASE_SERVICE_ROLE_KEY: {
        present: Boolean(serviceKey),
        looksLikeKey: serviceKey.startsWith('sb_secret_') || serviceKey.startsWith('eyJ'),
        preview: serviceKey ? `${serviceKey.slice(0, 10)}…(${serviceKey.length})` : null,
      },
    },
  });
}
