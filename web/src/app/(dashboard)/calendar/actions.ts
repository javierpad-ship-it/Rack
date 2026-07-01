'use server';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';

export type ActionResult<T = undefined> =
  | ({ ok: true } & (T extends undefined ? {} : { data: T }))
  | { ok: false; error: string };

async function ensureAdmin(): Promise<string | null> {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return 'No autenticado.';
  const { data: profile } = await supabase.from('profiles').select('role').eq('id', user.id).single();
  if (profile?.role !== 'admin') return 'Requiere rol admin.';
  return null;
}

export interface WeekYear {
  year: number;
  week1_start: string; // YYYY-MM-DD (domingo)
}

export async function listWeekCalendar(): Promise<ActionResult<WeekYear[]>> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  const admin = createAdminClient();
  const { data, error } = await admin
    .from('week_calendar')
    .select('year, week1_start')
    .order('year', { ascending: false });
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: (data ?? []) as WeekYear[] };
}

export async function upsertWeekYear(year: number, week1_start: string): Promise<ActionResult> {
  const err = await ensureAdmin();
  if (err) return { ok: false, error: err };
  if (!Number.isInteger(year) || year < 2000 || year > 2100) {
    return { ok: false, error: 'Año inválido.' };
  }
  const d = new Date(`${week1_start}T00:00:00Z`);
  if (isNaN(d.getTime())) return { ok: false, error: 'Fecha inválida.' };
  if (d.getUTCDay() !== 0) {
    return { ok: false, error: 'La fecha de inicio debe ser un DOMINGO.' };
  }
  const admin = createAdminClient();
  const { error } = await admin
    .from('week_calendar')
    .upsert({ year, week1_start }, { onConflict: 'year' });
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}
