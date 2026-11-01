// Lee la lista de QR que pega David (generada con tools) y arma la URL de cada punto.
// Formatos aceptados:
//   [{ "nombre": "Sala de poscosecha", "token": "<ubicacion_id>.<version>.<firma>" }, ...]
//   [{ "nombre": "...", "url": "https://portal/m/?q=<token>" }, ...]
//   { "puntos": [ ... ] }

import { tokenQRValido } from './marcacion.js';

export function parsearListaQR(texto, baseMarcacion) {
  let datos;
  try {
    datos = JSON.parse(texto);
  } catch {
    return { puntos: [], errores: ['El texto no es JSON válido.'] };
  }
  const lista = Array.isArray(datos) ? datos : (datos && Array.isArray(datos.puntos) ? datos.puntos : null);
  if (!lista) return { puntos: [], errores: ['Se esperaba una lista de puntos.'] };
  const puntos = [];
  const errores = [];
  lista.forEach((p, i) => {
    const n = i + 1;
    const nombre = p && typeof p.nombre === 'string' ? p.nombre.trim() : '';
    if (!nombre) { errores.push(`Punto ${n}: falta el nombre.`); return; }
    let token = p.token;
    if (!token && typeof p.url === 'string') {
      try { token = new URL(p.url).searchParams.get('q'); } catch { token = null; }
    }
    if (!tokenQRValido(token)) { errores.push(`Punto ${n} (${nombre}): el token no tiene el formato esperado.`); return; }
    const url = new URL(baseMarcacion);
    url.search = '';
    url.searchParams.set('q', token);
    puntos.push({ nombre, token, url: url.toString(), version: Number(token.split('.')[1]) });
  });
  return { puntos, errores };
}
