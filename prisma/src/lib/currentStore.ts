import { createClient } from '@/lib/supabase/server';
import { getSelectedStoreId, type PrismaStore } from '@/lib/store';

// Tienda seleccionada + sus datos (o null si no hay/ inválida).
export async function getCurrentStore(): Promise<PrismaStore | null> {
  const id = getSelectedStoreId();
  if (!id) return null;
  const supabase = createClient();
  const { data } = await supabase
    .from('stores')
    .select('id, code, name, sales_org, empresa_id')
    .eq('id', id)
    .single();
  return (data as PrismaStore) ?? null;
}
