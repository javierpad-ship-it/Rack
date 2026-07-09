// Los usuarios de Prisma se identifican por DNI. Supabase Auth trabaja con
// email, así que mapeamos el DNI a un email sintético estable. El mismo mapeo
// se usa al crear el usuario en Rack One (mantenimiento) y al iniciar sesión.
export const DNI_EMAIL_DOMAIN = 'prisma.lukers.local';

export function dniToEmail(dni: string): string {
  return `${dni.trim()}@${DNI_EMAIL_DOMAIN}`;
}

export function isValidDni(dni: string): boolean {
  return /^\d{6,12}$/.test(dni.trim());
}
