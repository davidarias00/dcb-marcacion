// Reglas puras de la pantalla de marcación: tipos, siguiente tipo sugerido,
// validación del token del QR, textos de los motivos de revisión y armado del cuerpo.

export const TIPOS = ['entrada', 'salida_almuerzo', 'regreso_almuerzo', 'salida'];

// Decisión de David (31 oct 2026): en el piloto solo se marcan entrada y salida.
// Desayuno y almuerzo no se marcan; el motor descuenta la alimentación del horario del punto.
// La API sigue aceptando los tipos de almuerzo por si se activan más adelante.
export const TIPOS_VISIBLES = ['entrada', 'salida'];

export const ETIQUETAS = {
  entrada: 'Entrada',
  salida_almuerzo: 'Salida a almuerzo',
  regreso_almuerzo: 'Regreso de almuerzo',
  salida: 'Salida',
};

const SIGUIENTE = {
  entrada: 'salida',
  salida_almuerzo: 'regreso_almuerzo',
  regreso_almuerzo: 'salida',
  salida: 'entrada',
};

export function esTipoValido(t) {
  return TIPOS.includes(t);
}

// Sugiere el tipo a marcar.
// - siguienteServidor: lo que respondió estado-hoy (puede ser null o faltar).
// - pendientes: marcaciones de hoy guardadas en la cola que el servidor aún no conoce
//   (en orden de captura). Si hay, mandan sobre la sugerencia del servidor.
// - hoy: lista de estado-hoy (o la guardada), por si no hay sugerencia del servidor.
export function sugerirTipo(opciones = {}) {
  const t = sugerirTipoTodos(opciones);
  return TIPOS_VISIBLES.includes(t) ? t : 'salida';
}

function sugerirTipoTodos({ siguienteServidor = null, hoy = [], pendientes = [] } = {}) {
  if (pendientes.length > 0) {
    const ultimo = pendientes[pendientes.length - 1].tipo;
    return SIGUIENTE[ultimo] || 'entrada';
  }
  if (esTipoValido(siguienteServidor)) return siguienteServidor;
  if (hoy.length > 0) {
    const ultimo = hoy[hoy.length - 1].tipo;
    return SIGUIENTE[ultimo] || 'entrada';
  }
  return 'entrada';
}

// token = <ubicacion_id>.<version>.<firma base64url de 16 bytes>
const RE_TOKEN = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}\.[0-9]{1,6}\.[A-Za-z0-9_-]{16,64}$/;

export function tokenQRValido(token) {
  return typeof token === 'string' && RE_TOKEN.test(token);
}

// Lee ?q= de la URL. Devuelve null si falta o no tiene forma de token.
export function leerTokenQR(search) {
  const q = new URLSearchParams(search || '').get('q');
  if (!q) return null;
  const t = q.trim();
  return tokenQRValido(t) ? t : null;
}

const MOTIVOS = {
  fuera_de_radio: 'La ubicación quedó lejos del punto.',
  gps_impreciso: 'La ubicación no fue precisa.',
  sin_gps: 'No se tomó la ubicación.',
  dispositivo_distinto: 'Marcaste desde un celular distinto al vinculado.',
  dispositivo_compartido: 'Este celular ya marcó por otra persona.',
  selfie_repetida: 'La selfie se parece a una anterior.',
  secuencia_imposible: 'El orden de las marcaciones de hoy no cuadra.',
  jornada_abierta: 'Hay una jornada sin salida.',
  diferida: 'Se envió más tarde porque no había señal.',
  selfie_calidad: 'La selfie no se ve bien.',
};

export function textoMotivo(codigo) {
  return MOTIVOS[codigo] || 'Hay algo para revisar.';
}

// Arma el cuerpo de POST marcar según docs/11-api-portal.md.
export function cuerpoMarcar({ qr, tipo, idempotencyKey, posicion, selfieBase64, diferida, tsDispositivo }) {
  if (!esTipoValido(tipo)) throw new Error('tipo inválido');
  if (!idempotencyKey) throw new Error('falta idempotency_key');
  if (!selfieBase64) throw new Error('falta la selfie');
  if (diferida && !tsDispositivo) throw new Error('una marcación diferida exige ts_dispositivo');
  const p = posicion && Number.isFinite(posicion.lat) && Number.isFinite(posicion.lng) ? posicion : null;
  return {
    qr,
    tipo,
    idempotency_key: idempotencyKey,
    lat: p ? p.lat : null,
    lng: p ? p.lng : null,
    precision_m: p && Number.isFinite(p.precision) ? Math.round(p.precision) : null,
    selfie_base64: selfieBase64,
    diferida: Boolean(diferida),
    ts_dispositivo: tsDispositivo || null,
  };
}

// Se queda con la mejor lectura de GPS (menor precisión en metros).
export function mejorPosicion(actual, nueva) {
  if (!nueva) return actual || null;
  if (!actual) return nueva;
  return nueva.precision < actual.precision ? nueva : actual;
}

// Antigüedad máxima que acepta el servidor para una marcación diferida.
export const MAX_DIFERIDA_MS = 72 * 3600 * 1000;

export function diferidaVencida(tsDispositivoIso, ahora = Date.now()) {
  const t = Date.parse(tsDispositivoIso);
  if (!Number.isFinite(t)) return true;
  return ahora - t > MAX_DIFERIDA_MS;
}
