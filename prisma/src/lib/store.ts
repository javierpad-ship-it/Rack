import { cookies } from 'next/headers';

export const STORE_COOKIE = 'prisma_store';

export type PrismaStore = { id: string; code: string; name: string; sales_org: string | null };

// Tienda seleccionada (cookie). Null si el usuario aún no eligió.
export function getSelectedStoreId(): string | null {
  return cookies().get(STORE_COOKIE)?.value ?? null;
}
