// Pestaña Hoy: quién marcó y quién falta, por ubicación base.
import { el, vaciar } from '../lib/dom.js';
import { fechaBogota, horaBogota, rangoDiaBogota } from '../lib/fechas.js';
import { resumenDia } from '../lib/resumen.js';
import { nombreEmpleado, nombreUbicacion, mostrarError, nodoAviso, chip, tabla, conBoton } from './comun.js';

const TEXTO_FALTA = {
  todo: ['No ha marcado', 'rojo'],
  entrada: ['Falta la entrada', 'amarillo'],
  salida: ['Sin salida', 'amarillo'],
  regreso_almuerzo: ['Sin regreso de almuerzo', 'amarillo'],
};

export async function montar(ctx, cont) {
  const fecha = el('input', { type: 'date', id: 'hoy-fecha', value: fechaBogota() });
  const btn = el('button', { type: 'button', text: 'Actualizar' });
  const av = nodoAviso();
  const resultado = el('div');
  vaciar(cont).append(
    el('h2', { text: 'Hoy' }),
    el('div', { class: 'botones' }, el('div', {}, el('label', { for: 'hoy-fecha', text: 'Fecha' }), fecha)),
    btn, av, resultado,
  );
  const cargar = () => conBoton(btn, () => pintar(ctx, fecha.value, resultado, av));
  btn.addEventListener('click', cargar);
  fecha.addEventListener('change', cargar);
  await cargar();
}

const hora = (ts) => (ts ? horaBogota(new Date(ts)) : '—');

function filaPersona(nombre, est) {
  const estado = [];
  if (est.falta) { const [t, c] = TEXTO_FALTA[est.falta]; estado.push(chip(t, c)); }
  else estado.push(chip('Completo', 'verde'));
  if (est.revision) estado.push(' ', chip('En revisión', 'amarillo'));
  if (est.diferida) estado.push(' ', chip('Diferida', 'amarillo'));
  return el('tr', {},
    el('td', { text: nombre }),
    el('td', { text: hora(est.entrada) }),
    el('td', { text: `${hora(est.salida_almuerzo)} / ${hora(est.regreso_almuerzo)}` }),
    el('td', { text: hora(est.salida) }),
    el('td', {}, estado));
}

async function pintar(ctx, fecha, cont, av) {
  vaciar(cont);
  let rango;
  try { rango = rangoDiaBogota(fecha); } catch { return mostrarError(av, { message: 'Fecha inválida.' }); }
  const { data, error } = await ctx.sb.from('marcaciones_vigentes')
    .select('id, empleado_id, ubicacion_id, tipo, ts_efectivo, estado, diferida, origen')
    .gte('ts_efectivo', rango.desde).lt('ts_efectivo', rango.hasta)
    .order('ts_efectivo');
  if (error) return mostrarError(av, error);
  av.hidden = true;

  // Campo no marca con QR (lo registra Alexander): no se cuenta como faltante.
  const empleados = Array.from(ctx.empleados.values())
    .filter((e) => e.activo && e.ubicacion_base_id && e.grupo !== 'campo');
  const r = resumenDia(empleados, data);
  cont.append(el('p', { class: 'aviso aviso-info', text: `Marcaron ${r.marcaron} de ${r.total} personas.` }));
  if (r.faltan.length) {
    cont.append(el('p', {}, el('strong', { text: 'No han marcado: ' }), r.faltan.map((e) => e.nombre_completo).join(', ')));
  }
  const encabezados = ['Persona', 'Entrada', 'Almuerzo (salida / regreso)', 'Salida', 'Estado'];
  const grupos = Array.from(r.grupos.entries()).sort((a, b) => nombreUbicacion(ctx, a[0]).localeCompare(nombreUbicacion(ctx, b[0])));
  for (const [ubicacionId, filas] of grupos) {
    cont.append(el('h3', { text: nombreUbicacion(ctx, ubicacionId) }),
      tabla(encabezados, filas.map((f) => filaPersona(f.empleado.nombre_completo, f.estado))));
  }
  if (r.otros.length) {
    cont.append(el('h3', { text: 'Otras personas que marcaron' }),
      tabla(encabezados, r.otros.map((o) => filaPersona(nombreEmpleado(ctx, o.empleadoId), o.estado))));
  }
}
