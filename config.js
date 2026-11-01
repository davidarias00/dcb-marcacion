// Configuración pública del portal. Al desplegar, reemplaza los dos marcadores
// (ver README.md). La clave anon es pública por diseño: la protección está en RLS
// y en las edge functions. Nunca pongas aquí la clave service_role ni otro secreto.
export const SUPABASE_URL = 'https://vmklcqtedkowbwefcayl.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZta2xjcXRlZGtvd2J3ZWZjYXlsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTM1NTcxMTAsImV4cCI6MjEwOTEzMzExMH0.k4c5Yrj5538R5M6K3VT4KIJHNDeIPVrYNBUDklK1xnI';

// Cómo recibe la persona su código de vinculación (solo la primera vez):
// 'panel' = Tatiana lo genera en el panel y se lo da (piloto); 'whatsapp' = llega por WhatsApp.
export const MODO_CODIGO = 'panel';

export function configLista() {
  return !SUPABASE_URL.startsWith('__') && !SUPABASE_ANON_KEY.startsWith('__');
}

export function urlFunciones() {
  return SUPABASE_URL.replace(/\/+$/, '') + '/functions/v1';
}
