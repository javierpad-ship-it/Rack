// Los usuarios de Prisma se identifican por DNI (usuario y clave inicial = DNI).
// Supabase Auth trabaja con email, así que se mapea a un email sintético estable.
// Debe coincidir con prisma/src/lib/dni.ts (misma base Supabase).
export const DNI_EMAIL_DOMAIN = 'prisma.lukers.local';

export function dniToEmail(dni: string): string {
  return `${dni.trim()}@${DNI_EMAIL_DOMAIN}`;
}

export function isValidDni(dni: string): boolean {
  return /^\d{6,12}$/.test(dni.trim());
}
