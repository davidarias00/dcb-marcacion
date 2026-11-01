// Modo demostración: simula las edge functions para probar la página desde un celular
// antes de que exista el proyecto de Supabase. Solo se activa si el portal NO está
// configurado (config.js con marcadores) y la URL trae ?demo=1. No guarda nada en un
// servidor ni envía WhatsApp; el código de vinculación es siempre 123456.

export const TOKEN_QR_DEMO = '00000000-0000-4000-8000-000000000001.1.DemoDemoDemoDemoDemo';
const CLAVE = 'dcb_demo_marcas';

export function demoActiva(search, configurado) {
  if (configurado) return false;
  try {
    if (new URLSearchParams(search || '').get('demo') === '1') sessionStorage.setItem('dcb_demo', '1');
    return sessionStorage.getItem('dcb_demo') === '1';
  } catch {
    return new URLSearchParams(search || '').get('demo') === '1';
  }
}

function hora(d = new Date()) {
  return new Date(d.getTime() - 5 * 3600000).toISOString().slice(11, 16);
}

function hoy() {
  return new Date(Date.now() - 5 * 3600000).toISOString().slice(0, 10);
}

// Respaldo en memoria si el navegador no deja usar localStorage.
let memoria = { fecha: null, marcas: [] };

function leerMarcas() {
  let d = memoria;
  try { d = JSON.parse(localStorage.getItem(CLAVE)) || memoria; } catch { /* sin almacenamiento */ }
  return d.fecha === hoy() ? d.marcas : [];
}

function guardarMarcas(marcas) {
  memoria = { fecha: hoy(), marcas };
  try { localStorage.setItem(CLAVE, JSON.stringify(memoria)); } catch { /* sin almacenamiento */ }
}

function respuesta(status, cuerpo) {
  return new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
}

/** fetch simulado con el mismo contrato de docs/11-api-portal.md. */
export async function fetchDemo(url, opciones = {}) {
  await new Promise((r) => setTimeout(r, 400));
  const ruta = String(url).split('/').pop();
  const cuerpo = opciones.body ? JSON.parse(opciones.body) : {};
  const marcas = leerMarcas();
  switch (ruta) {
    case 'vincular-solicitar':
      return respuesta(200, { ok: true, mensaje: 'Modo demostración: tu código es 123456 (no se envía WhatsApp).' });
    case 'vincular-confirmar':
      if (cuerpo.codigo !== '123456') return respuesta(400, { error: 'codigo_invalido', mensaje: 'En la demostración el código es 123456.' });
      return respuesta(200, { token_dispositivo: 'demo-' + 'x'.repeat(40), nombre: 'Prueba' });
    case 'estado-hoy': {
      const ultimo = marcas.at(-1)?.tipo;
      return respuesta(200, { nombre: 'Prueba', hoy: marcas, siguiente: ultimo === 'entrada' ? 'salida' : 'entrada' });
    }
    case 'marcar': {
      const motivos = [];
      if (cuerpo.lat == null) motivos.push('sin_gps');
      else if (cuerpo.precision_m > 100) motivos.push('gps_impreciso');
      const m = { tipo: cuerpo.tipo, hora: hora(), ubicacion: 'Punto de demostración' };
      guardarMarcas([...marcas, m]);
      return respuesta(200, { estado: motivos.length ? 'revision' : 'ok', hora: m.hora, tipo: m.tipo, ubicacion: m.ubicacion, motivos });
    }
    default:
      return respuesta(404, { error: 'datos_invalidos', mensaje: 'Ruta desconocida' });
  }
}
