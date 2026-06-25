import { createClient as createSupabaseClient } from '@supabase/supabase-js';

// Cliente con service-role para tareas administrativas server-side
// (importaciones masivas, disparo de RPC). NUNCA usar desde el cliente.
export function createAdminClient() {
  return createSupabaseClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}
