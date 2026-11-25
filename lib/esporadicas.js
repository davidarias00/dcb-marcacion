// "Agregar esporádica": alta rápida de una persona por días que viene uno o pocos días y sus días
// trabajados (entrada y salida) desde el panel. Lógica pura; la pantalla está en panel/personas.js.
// La persona queda en el frente B (por días, Jornal 8 h): el motor liquida sus días como a cualquier
// persona por días. Los días se guardan como marcaciones de origen 'panel' con motivo, igual que la
// Captura degradada; la base exige rol, usuario y motivo.
import { validarPersona } from './personas.js';
import { isoDesdeFechaHora } from './fechas.js';
import { textoLimpio } from './validacion.js';

export const CARGO_ESPORADICA = 'Esporádica';
const MAX_DIAS = 16;

// Formulario corto -> { errores, datos, cedula, whatsapp } listo para guardar_empleado().
export function validarEsporadica(f, regimenJornalId, hoy) {
  const r = validarPersona({
    nombre_completo: f.nombre_completo,
    frente: 'B',
    regimen_id: regimenJornalId,
    ubicacion_base_id: f.ubicacion_base_id,
    marca_en_cualquier_punto: false,
    paga_begranda: false,
    medio_pago: f.medio_pago,
    cargo: CARGO_ESPORADICA,
    fecha_ingreso: f.primer_dia || hoy,
    activo: true,
    cedula: f.cedula,
    whatsapp: f.whatsapp,
  }, true);
  if (!regimenJornalId) r.errores.push('No encuentro el régimen Jornal (8 h); avísale a David.');
  return r;
}

const minutos = (h) => Number(h.slice(0, 2)) * 60 + Number(h.slice(3, 5));

// Días escritos [{ fecha, entrada, salida }] -> { errores, filas } para insertar en marcaciones.
// Ignora las filas vacías. nuevoId() da la llave de cada marcación (un doble clic no duplica).
export function filasDias(dias, { empleadoId, ubicacionId, uid, motivo, hoy, nuevoId }) {
  const errores = [];
  const filas = [];
  const vistas = new Set();
  const llenas = dias.filter((d) => d.fecha || d.entrada || d.salida);
  if (!llenas.length) errores.push('Escribe al menos un día con su hora de entrada y de salida.');
  if (llenas.length > MAX_DIAS) errores.push(`Máximo ${MAX_DIAS} días a la vez.`);
  const m = textoLimpio(motivo);
  for (const d of llenas) {
    const nombre = d.fecha || 'sin fecha';
    if (!d.fecha || !d.entrada || !d.salida) { errores.push(`Día ${nombre}: falta la fecha, la entrada o la salida.`); continue; }
    if (d.fecha > hoy) { errores.push(`Día ${nombre}: no puede ser una fecha futura.`); continue; }
    if (vistas.has(d.fecha)) { errores.push(`Día ${nombre}: está repetido.`); continue; }
    vistas.add(d.fecha);
    let entrada;
    let salida;
    try {
      entrada = isoDesdeFechaHora(d.fecha, d.entrada);
      salida = isoDesdeFechaHora(d.fecha, d.salida);
    } catch {
      errores.push(`Día ${nombre}: revisa las horas.`);
      continue;
    }
    if (minutos(d.salida) <= minutos(d.entrada)) { errores.push(`Día ${nombre}: la salida debe ser después de la entrada.`); continue; }
    const base = { empleado_id: empleadoId, ubicacion_id: ubicacionId, origen: 'panel', registrado_por: uid, motivo: m };
    filas.push(
      { ...base, tipo: 'entrada', ts_efectivo: entrada, idempotency_key: nuevoId() },
      { ...base, tipo: 'salida', ts_efectivo: salida, idempotency_key: nuevoId() },
    );
  }
  return { errores, filas };
}

export function motivoDias(nombreQuienRegistra) {
  return `Esporádica: días registrados desde el panel por ${textoLimpio(nombreQuienRegistra) || 'operaciones'}`;
}
