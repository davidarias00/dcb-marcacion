// Cliente de supabase-js para campo y panel (la marcación no lo usa).
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.45.4/+esm';
import { SUPABASE_URL, SUPABASE_ANON_KEY, configLista } from '../config.js';

export function crearSupabase() {
  if (!configLista()) throw new Error('Falta configurar config.js');
  return createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false },
  });
}

// Perfil del usuario con sesión (rol y nombre). RLS deja leer el propio.
export async function perfilActual(sb, userId) {
  const { data, error } = await sb.from('perfiles').select('rol, nombre, activo').eq('user_id', userId).maybeSingle();
  if (error) throw error;
  return data;
}
