// Configuración pública del portal. Al desplegar, reemplaza los dos marcadores
// (ver README.md). La clave anon es pública por diseño: la protección está en RLS
// y en las edge functions. Nunca pongas aquí la clave service_role ni otro secreto.
export const SUPABASE_URL = '__SUPABASE_URL__';
export const SUPABASE_ANON_KEY = '__SUPABASE_ANON_KEY__';

export function configLista() {
  return !SUPABASE_URL.startsWith('__') && !SUPABASE_ANON_KEY.startsWith('__');
}

export function urlFunciones() {
  return SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1';
}
