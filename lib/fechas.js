// Fechas y horas en Colombia (America/Bogota, UTC-5 todo el año, sin horario de verano).

const OFFSET_MIN = -5 * 60;
const pad = (n) => String(n).padStart(2, '0');

// Fecha y hora "de pared" en Bogotá para un instante.
function partesBogota(d) {
  const t = new Date(d.getTime() + OFFSET_MIN * 60000);
  return {
    y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate(),
    h: t.getUTCHours(), mi: t.getUTCMinutes(), s: t.getUTCSeconds(),
  };
}

// 'YYYY-MM-DD' en Bogotá.
export function fechaBogota(d = new Date()) {
  const p = partesBogota(d instanceof Date ? d : new Date(d));
  return `${p.y}-${pad(p.m)}-${pad(p.d)}`;
}

// 'HH:MM' (24 h) en Bogotá.
export function horaBogota(d) {
  const p = partesBogota(d instanceof Date ? d : new Date(d));
  return `${pad(p.h)}:${pad(p.mi)}`;
}

// ISO con zona de Bogotá: '2026-11-02T06:01:10-05:00' (formato de ts_dispositivo).
export function isoBogota(d = new Date()) {
  const p = partesBogota(d instanceof Date ? d : new Date(d));
  return `${p.y}-${pad(p.m)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}:${pad(p.s)}-05:00`;
}

const RE_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const RE_HORA = /^\d{2}:\d{2}$/;

// Fecha y hora escritas en Bogotá -> ISO con zona.
export function isoDesdeFechaHora(fecha, hora) {
  if (!RE_FECHA.test(fecha) || !RE_HORA.test(hora)) throw new Error('fecha u hora inválida');
  const iso = `${fecha}T${hora}:00-05:00`;
  if (!Number.isFinite(Date.parse(iso))) throw new Error('fecha u hora inválida');
  return iso;
}

// Intervalo [desde, hasta) de un día de Bogotá, para filtrar ts_efectivo.
export function rangoDiaBogota(fecha) {
  if (!RE_FECHA.test(fecha)) throw new Error('fecha inválida');
  const desde = new Date(`${fecha}T00:00:00-05:00`);
  const hasta = new Date(desde.getTime() + 24 * 3600 * 1000);
  return { desde: desde.toISOString(), hasta: hasta.toISOString() };
}

export function sumarDias(fecha, n) {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

// '2026-11-02' -> 'lunes 2 de noviembre'
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto',
  'septiembre', 'octubre', 'noviembre', 'diciembre'];
export function fechaLarga(fecha) {
  const d = new Date(`${fecha}T12:00:00Z`);
  return `${DIAS[d.getUTCDay()]} ${d.getUTCDate()} de ${MESES[d.getUTCMonth()]}`;
}
