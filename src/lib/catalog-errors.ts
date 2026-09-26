/**
 * Helpers to turn database errors into messages a contractor can act on.
 * Kept outside the 'use server' modules because a 'use server' file may only
 * export async functions.
 */
export function catalogErrorMessage(message?: string | null): string {
  const msg = message || 'Error desconocido'
  if (msg.includes('schema cache') || msg.includes('does not exist')) {
    return 'Faltan columnas en la base de datos. Ejecuta la migración supabase/migrations/20260927000000_catalog_service_metadata.sql en el SQL Editor de Supabase y reinténtalo.'
  }
  return msg
}
