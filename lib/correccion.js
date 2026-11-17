// Corrección y anulación de marcaciones desde el panel. Lógica pura.
// Las marcaciones son de solo inserción: se corrigen con un registro nuevo (corrige_a) que
// deja la original intacta. La vista marcaciones_vigentes ya excluye la corregida y las anuladas.
import { textoLimpio, motivoValido } from './validacion.js';
import { isoDesdeFechaHora } from './fechas.js';

// original: fila de marcaciones_vigentes. accion: 'anular' | 'hora'.
// Devuelve { error } o { fila } para insertar en marcaciones.
export function filaCorreccion(original, { accion, fecha, hora, motivo, uid, clave, ahora = Date.now() }) {
  const m = textoLimpio(motivo);
  if (!motivoValido(m, 10)) return { error: 'El motivo es obligatorio (al menos 10 caracteres).' };
  if (!uid || !clave) return { error: 'Falta el usuario o la clave de la corrección.' };
  const base = {
    empleado_id: original.empleado_id, ubicacion_id: original.ubicacion_id, tipo: original.tipo,
    origen: 'panel', registrado_por: uid, motivo: m, corrige_a: original.id, idempotency_key: clave,
  };
  if (accion === 'anular') return { fila: { ...base, ts_efectivo: original.ts_efectivo, estado: 'anulada' } };
  if (accion === 'hora') {
    let ts;
    try { ts = isoDesdeFechaHora(fecha, hora); } catch { return { error: 'Revisa la fecha y la hora.' }; }
    if (Date.parse(ts) > ahora + 5 * 60000) return { error: 'La hora no puede ser futura.' };
    return { fila: { ...base, ts_efectivo: ts, estado: 'ok' } };
  }
  return { error: 'Acción desconocida.' };
}
