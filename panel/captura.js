// Pestaña Captura degradada: registrar una marcación desde el panel cuando el QR no funciona.
// RLS exige origen 'panel', registrado_por = usuario y motivo.
import { el, vaciar, aviso } from '../lib/dom.js';
import { puede } from '../lib/permisos.js';
import { TIPOS, ETIQUETAS } from '../lib/marcacion.js';
import { nuevoId } from '../lib/ids.js';
import { fechaBogota, horaBogota, isoDesdeFechaHora } from '../lib/fechas.js';
import { motivoValido, textoLimpio, esDuplicado } from '../lib/validacion.js';
import { nombreEmpleado, nombreUbicacion, mostrarError, nodoAviso, conBoton } from './comun.js';

export async function montar(ctx, cont) {
  vaciar(cont).append(el('h2', { text: 'Captura degradada' }));
  if (!puede(ctx.rol, 'captura_degradada')) {
    cont.append(el('p', { class: 'aviso aviso-info', text: 'Tu rol no registra marcaciones desde el panel.' }));
    return;
  }
  cont.append(el('p', { class: 'aviso aviso-alerta', text: 'Úsala solo cuando la marcación con QR no funcione (sin señal, celular dañado, caída del sistema). Queda registrada con tu usuario y el motivo.' }));

  const persona = el('select', { id: 'cap-persona', required: true },
    el('option', { value: '', text: 'Elige la persona' }),
    Array.from(ctx.empleados.values()).filter((e) => e.activo)
      .map((e) => el('option', { value: e.id, text: e.nombre_completo })));
  const ubicacion = el('select', { id: 'cap-ubicacion', required: true },
    el('option', { value: '', text: 'Elige el punto' }),
    Array.from(ctx.ubicaciones.values()).filter((u) => u.activa && u.permite_marcar)
      .map((u) => el('option', { value: u.id, text: u.nombre })));
  const tipo = el('select', { id: 'cap-tipo' }, TIPOS.map((t) => el('option', { value: t, text: ETIQUETAS[t] })));
  const fecha = el('input', { id: 'cap-fecha', type: 'date', value: fechaBogota(), max: fechaBogota() });
  const hora = el('input', { id: 'cap-hora', type: 'time', value: horaBogota(new Date()) });
  const motivo = el('textarea', { id: 'cap-motivo', maxlength: 500, required: true });
  const av = nodoAviso();
  const b = el('button', { type: 'button', class: 'primario', text: 'Registrar la marcación' });

  // La clave se renueva solo después de un registro exitoso: un doble clic no duplica.
  let clave = nuevoId();
  persona.addEventListener('change', () => { if (persona.value) ubicacion.value = ctx.empleados.get(persona.value).ubicacion_base_id || ubicacion.value; });

  b.addEventListener('click', () => conBoton(b, async () => {
    const m = textoLimpio(motivo.value);
    if (!persona.value) return aviso(av, 'Elige la persona.', 'error');
    if (!ubicacion.value) return aviso(av, 'Elige el punto.', 'error');
    if (!motivoValido(m, 10)) return aviso(av, 'El motivo es obligatorio (al menos 10 caracteres).', 'error');
    let ts;
    try { ts = isoDesdeFechaHora(fecha.value, hora.value); } catch { return aviso(av, 'Revisa la fecha y la hora.', 'error'); }
    if (Date.parse(ts) > Date.now() + 5 * 60000) return aviso(av, 'La hora no puede ser futura.', 'error');
    const fila = {
      empleado_id: persona.value, ubicacion_id: ubicacion.value, tipo: tipo.value,
      ts_efectivo: ts, origen: 'panel', registrado_por: ctx.uid, motivo: m, idempotency_key: clave,
    };
    const { error } = await ctx.sb.from('marcaciones').insert(fila);
    if (error && !esDuplicado(error)) return mostrarError(av, error);
    aviso(av, `Registrada: ${ETIQUETAS[fila.tipo]} de ${nombreEmpleado(ctx, fila.empleado_id)} en ${nombreUbicacion(ctx, fila.ubicacion_id)}, ${fecha.value} ${hora.value}.`, 'ok');
    clave = nuevoId();
    motivo.value = '';
    persona.value = '';
  }));

  cont.append(
    el('label', { for: persona.id, text: 'Persona' }), persona,
    el('label', { for: ubicacion.id, text: 'Punto' }), ubicacion,
    el('label', { for: tipo.id, text: 'Tipo' }), tipo,
    el('label', { for: fecha.id, text: 'Fecha' }), fecha,
    el('label', { for: hora.id, text: 'Hora (Colombia)' }), hora,
    el('label', { for: motivo.id, text: 'Motivo' }), motivo,
    b, av);
}
