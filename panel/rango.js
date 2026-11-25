// Pestaña Por fechas: cómo va la marcación en un rango (este mes, la quincena o el que se elija).
// Solo muestra asistencia (marcas y qué falta); las horas y la plata las calcula el motor.
import { el, vaciar, aviso } from '../lib/dom.js';
import {
  fechaBogota, horaBogota, rangoFechasBogota, diasEntre, inicioMes, inicioQuincena, fechaCorta,
} from '../lib/fechas.js';
import { resumenRango } from '../lib/resumen.js';
import { ETIQUETAS } from '../lib/marcacion.js';
import { filaCorreccion } from '../lib/correccion.js';
import { nuevoId } from '../lib/ids.js';
import { puede } from '../lib/permisos.js';
import { nombreEmpleado, nombreUbicacion, esEsporadica, mostrarError, nodoAviso, chip, tabla, conBoton } from './comun.js';

const MAX_DIAS = 93;
const PAGINA = 1000;

const TEXTO_FALTA = {
  entrada: ['Falta la entrada', 'amarillo'],
  salida: ['Sin salida', 'amarillo'],
  regreso_almuerzo: ['Sin regreso de almuerzo', 'amarillo'],
};

export async function montar(ctx, cont) {
  const hoy = fechaBogota();
  const desde = el('input', { type: 'date', id: 'rango-desde', value: inicioMes(hoy), max: hoy });
  const hasta = el('input', { type: 'date', id: 'rango-hasta', value: hoy });
  const btn = el('button', { type: 'button', class: 'primario', text: 'Ver' });
  const atajo = (texto, fn) => {
    const b = el('button', { type: 'button', text: texto });
    b.addEventListener('click', () => { const [d, h] = fn(fechaBogota()); desde.value = d; hasta.value = h; cargar(); });
    return b;
  };
  const av = nodoAviso();
  const resultado = el('div');
  vaciar(cont).append(
    el('h2', { text: 'Por fechas' }),
    el('div', { class: 'botones' },
      el('div', {}, el('label', { for: desde.id, text: 'Desde' }), desde),
      el('div', {}, el('label', { for: hasta.id, text: 'Hasta' }), hasta)),
    el('div', { class: 'botones' },
      atajo('Este mes', (h) => [inicioMes(h), h]),
      atajo('Esta quincena', (h) => [inicioQuincena(h), h]),
      atajo('Mes pasado', (h) => {
        const fin = new Date(`${inicioMes(h)}T12:00:00Z`);
        fin.setUTCDate(0);
        const f = fin.toISOString().slice(0, 10);
        return [inicioMes(f), f];
      }),
      btn),
    av, resultado,
  );
  const cargar = () => conBoton(btn, () => pintar(ctx, desde.value, hasta.value, resultado, av, cargar));
  btn.addEventListener('click', cargar);
  await cargar();
}

const hora = (ts) => (ts ? horaBogota(new Date(ts)) : '—');

// PostgREST devuelve como máximo 1000 filas por consulta: se pide por páginas.
async function marcacionesDelRango(ctx, rango) {
  const todas = [];
  for (let i = 0; ; i += PAGINA) {
    const { data, error } = await ctx.sb.from('marcaciones_vigentes')
      .select('id, empleado_id, ubicacion_id, tipo, ts_efectivo, estado, diferida, origen')
      .gte('ts_efectivo', rango.desde).lt('ts_efectivo', rango.hasta)
      .order('ts_efectivo').order('id')
      .range(i, i + PAGINA - 1);
    if (error) throw error;
    todas.push(...data);
    if (data.length < PAGINA) return todas;
  }
}

// Fecha (Bogotá) en que cada persona vinculó su primer celular: antes no podía marcar.
async function inicioPorPersona(ctx) {
  const { data, error } = await ctx.sb.from('dispositivos').select('empleado_id, vinculado_ts');
  if (error) throw error;
  const m = new Map();
  for (const d of data) {
    const f = fechaBogota(new Date(d.vinculado_ts));
    if (!m.has(d.empleado_id) || f < m.get(d.empleado_id)) m.set(d.empleado_id, f);
  }
  return m;
}

async function contarAlertas(ctx, rango, estado) {
  const { count, error } = await ctx.sb.from('alertas')
    .select('id', { count: 'exact', head: true })
    .eq('estado', estado).gte('created_at', rango.desde).lt('created_at', rango.hasta);
  if (error) throw error;
  return count || 0;
}

function estadoChips(est) {
  const r = [];
  if (est.falta && TEXTO_FALTA[est.falta]) { const [t, c] = TEXTO_FALTA[est.falta]; r.push(chip(t, c)); }
  else r.push(chip('Completo', 'verde'));
  if (est.repetidas) r.push(' ', chip('Marca repetida', 'rojo'));
  if (est.revision) r.push(' ', chip('En revisión', 'amarillo'));
  if (est.diferida) r.push(' ', chip('Diferida', 'amarillo'));
  return r;
}

async function pintar(ctx, fDesde, fHasta, cont, av, recargar) {
  vaciar(cont);
  let rango;
  let dias;
  try {
    rango = rangoFechasBogota(fDesde, fHasta);
    dias = diasEntre(fDesde, fHasta);
  } catch (e) {
    return mostrarError(av, { message: e.message === 'fecha inválida' ? 'Elige las dos fechas.' : 'La fecha "Desde" debe ser anterior a "Hasta".' });
  }
  if (dias.length > MAX_DIAS) return mostrarError(av, { message: `Elige un rango de máximo ${MAX_DIAS} días.` });

  let marcas;
  let abiertas;
  let resueltas;
  let inicios;
  try {
    [marcas, abiertas, resueltas, inicios] = await Promise.all([
      marcacionesDelRango(ctx, rango), contarAlertas(ctx, rango, 'abierta'), contarAlertas(ctx, rango, 'resuelta'),
      inicioPorPersona(ctx),
    ]);
  } catch (e) {
    return mostrarError(av, e);
  }
  av.hidden = true;

  // Campo no marca con QR (lo registra Alexander) y las esporádicas se registran en Personas: no se cuentan.
  const empleados = Array.from(ctx.empleados.values())
    .filter((e) => e.activo && e.ubicacion_base_id && e.grupo !== 'campo' && !esEsporadica(e))
    .sort((a, b) => nombreUbicacion(ctx, a.ubicacion_base_id).localeCompare(nombreUbicacion(ctx, b.ubicacion_base_id))
      || a.nombre_completo.localeCompare(b.nombre_completo));
  const hoy = fechaBogota();
  const r = resumenRango(empleados, marcas, dias, (ts) => fechaBogota(new Date(ts)), hoy, inicios);
  const sinAyuda = marcas.filter((m) => m.origen === 'qr').length;

  cont.append(
    el('p', { class: 'aviso aviso-info', text: `Del ${fechaCorta(fDesde)} al ${fechaCorta(fHasta)}: ${r.completos} días completos, `
      + `${r.incompletos} incompletos y ${r.sinMarcas} días sin ninguna marca desde que cada persona vinculó su celular `
      + '(verificar si trabajó o era su descanso).' }),
    el('p', {}, `${marcas.length} marcaciones; `,
      el('strong', { text: marcas.length ? `${Math.round((100 * sinAyuda) / marcas.length)} % sin ayuda` : '— sin ayuda' }),
      ` (QR). Alertas creadas en el rango: ${abiertas} abiertas, ${resueltas} resueltas.`),
  );

  cont.append(el('h3', { text: 'Por persona' }), tabla(
    ['Persona', 'Punto', 'Completos', 'Incompletos', 'En revisión', 'Sin marcas'],
    r.personas.map((p) => el('tr', {},
      el('td', { text: p.empleado.nombre_completo }),
      el('td', { text: nombreUbicacion(ctx, p.empleado.ubicacion_base_id) }),
      el('td', { text: String(p.completos) }),
      el('td', {}, p.incompletos ? chip(String(p.incompletos), 'amarillo') : '0'),
      el('td', { text: String(p.revision) }),
      el('td', {}, p.sinCelular ? chip('Sin celular', 'rojo') : String(p.sinMarcas.length)))),
  ));

  const conDias = r.personas.filter((p) => p.sinMarcas.length);
  if (conDias.length) {
    cont.append(
      el('h3', { text: 'Días sin marcas (verificar si trabajó)' }),
      el('ul', {}, conDias.map((p) => el('li', {},
        el('strong', { text: `${p.empleado.nombre_completo}: ` }), p.sinMarcas.map(fechaCorta).join(', ')))),
    );
  }

  cont.append(el('h3', { text: 'Día por día' }));
  if (!r.detalle.length) {
    cont.append(el('p', { class: 'suave', text: 'No hay marcaciones en este rango.' }));
    return;
  }
  const corrige = puede(ctx.rol, 'captura_degradada');
  if (corrige) cont.append(el('p', { class: 'suave', text: 'Con "Marcas" ves cada marca del día y puedes anular una repetida o corregir su hora. Siempre con motivo; la marca original no se borra.' }));
  const filas = [];
  for (const d of r.detalle) {
    const sub = el('tr', { hidden: true }, el('td', { colspan: 6 }));
    const b = el('button', { type: 'button', text: 'Marcas' });
    b.addEventListener('click', () => {
      sub.hidden = !sub.hidden;
      if (!sub.hidden) pintarMarcas(ctx, marcas.filter((m) => m.empleado_id === d.empleadoId && fechaBogota(new Date(m.ts_efectivo)) === d.fecha), sub.firstChild, corrige, recargar);
    });
    filas.push(el('tr', {},
      el('td', { text: fechaCorta(d.fecha) }),
      el('td', { text: nombreEmpleado(ctx, d.empleadoId) }),
      el('td', { text: hora(d.estado.entrada) }),
      el('td', { text: hora(d.estado.salida) }),
      el('td', {}, d.fecha === hoy && d.estado.falta === 'salida' ? chip('Jornada abierta', null) : estadoChips(d.estado)),
      el('td', {}, b)), sub);
  }
  cont.append(tabla(['Día', 'Persona', 'Entrada', 'Salida', 'Estado', ''], filas));
}

// Marcas de una persona en un día, con anular y corregir la hora (registro nuevo con corrige_a).
function pintarMarcas(ctx, lista, cont, corrige, recargar) {
  vaciar(cont);
  for (const m of lista.sort((a, b) => Date.parse(a.ts_efectivo) - Date.parse(b.ts_efectivo))) {
    const fila = el('div', { class: 'tarjeta' },
      el('strong', { text: `${ETIQUETAS[m.tipo] ?? m.tipo} ${hora(m.ts_efectivo)}` }),
      ' ', m.origen === 'qr' ? chip('QR', 'verde') : chip('Panel', null),
      m.estado === 'revision' ? [' ', chip('En revisión', 'amarillo')] : null);
    if (corrige) {
      const nuevaHora = el('input', { type: 'time', value: hora(m.ts_efectivo), 'aria-label': 'Hora correcta' });
      const motivo = el('input', { type: 'text', maxlength: 500, placeholder: 'Motivo (obligatorio)', 'aria-label': 'Motivo' });
      const avm = nodoAviso();
      const clave = nuevoId();
      const enviar = (accion, boton) => conBoton(boton, async () => {
        const r = filaCorreccion(m, { accion, fecha: fechaBogota(new Date(m.ts_efectivo)), hora: nuevaHora.value, motivo: motivo.value, uid: ctx.uid, clave });
        if (r.error) return aviso(avm, r.error, 'error');
        const { error } = await ctx.sb.from('marcaciones').insert(r.fila);
        if (error) return mostrarError(avm, error);
        await recargar();
      });
      const anular = el('button', { type: 'button', text: 'Anular esta marca' });
      const cambiar = el('button', { type: 'button', text: 'Corregir la hora' });
      anular.addEventListener('click', () => enviar('anular', anular));
      cambiar.addEventListener('click', () => enviar('hora', cambiar));
      fila.append(el('div', { class: 'botones' }, nuevaHora, motivo, cambiar, anular), avm);
    }
    cont.append(fila);
  }
}
