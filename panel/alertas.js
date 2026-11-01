// Pestaña Alertas: alertas abiertas con selfie (URL firmada corta) y mapa; resolver exige motivo.
import { el, vaciar, aviso } from '../lib/dom.js';
import { puede } from '../lib/permisos.js';
import { motivoValido, textoLimpio } from '../lib/validacion.js';
import { ETIQUETAS } from '../lib/marcacion.js';
import { nombreEmpleado, nombreUbicacion, fechaHora, mostrarError, nodoAviso, conBoton } from './comun.js';

const TIPO_ALERTA = {
  fuera_de_radio: 'Fuera del radio del punto',
  gps_impreciso: 'GPS impreciso',
  sin_gps: 'Sin ubicación',
  dispositivo_distinto: 'Celular distinto al vinculado',
  dispositivo_compartido: 'Un celular marcó por dos personas',
  selfie_repetida: 'Selfie repetida',
  secuencia_imposible: 'Secuencia imposible',
  jornada_abierta: 'Jornada abierta',
  diferida: 'Marcación diferida (sin señal)',
  muchos_intentos: 'Muchos intentos',
  selfie_calidad: 'Calidad de la selfie',
  otro: 'Otra',
};
const SEGUNDOS_URL_FIRMADA = 60;

export async function montar(ctx, cont) {
  const btn = el('button', { type: 'button', text: 'Actualizar' });
  const av = nodoAviso();
  const lista = el('div');
  vaciar(cont).append(el('h2', { text: 'Alertas abiertas' }), btn, av, lista);
  const cargar = () => conBoton(btn, () => pintar(ctx, lista, av));
  btn.addEventListener('click', cargar);
  await cargar();
}

async function pintar(ctx, lista, av) {
  vaciar(lista);
  const { data: alertas, error } = await ctx.sb.from('alertas')
    .select('id, marcacion_id, empleado_id, dispositivo_id, tipo, detalle, estado, created_at')
    .eq('estado', 'abierta').order('created_at', { ascending: false }).limit(200);
  if (error) return mostrarError(av, error);
  const ids = [...new Set(alertas.map((a) => a.marcacion_id).filter(Boolean))];
  let marcaciones = new Map();
  if (ids.length) {
    const r = await ctx.sb.from('marcaciones')
      .select('id, empleado_id, ubicacion_id, tipo, ts_efectivo, ts_dispositivo, lat, lng, precision_m, distancia_m, selfie_path, diferida, estado, motivos_revision')
      .in('id', ids);
    if (r.error) return mostrarError(av, r.error);
    marcaciones = new Map(r.data.map((m) => [m.id, m]));
  }
  aviso(av, alertas.length ? `${alertas.length} alertas abiertas.` : 'No hay alertas abiertas.', alertas.length ? 'alerta' : 'ok');
  for (const a of alertas) lista.append(tarjetaAlerta(ctx, a, marcaciones.get(a.marcacion_id), lista, av));
}

function textoDetalle(detalle) {
  if (!detalle || typeof detalle !== 'object') return '';
  return Object.entries(detalle).map(([k, v]) => `${k}: ${typeof v === 'object' ? JSON.stringify(v) : v}`).join(' · ');
}

function tarjetaAlerta(ctx, a, m, lista, avLista) {
  const empleadoId = a.empleado_id || (m && m.empleado_id);
  const t = el('article', { class: 'tarjeta' });
  t.append(el('h3', { text: `${TIPO_ALERTA[a.tipo] || a.tipo} · ${empleadoId ? nombreEmpleado(ctx, empleadoId) : 'sin persona'}` }));
  t.append(el('p', { class: 'suave', text: `Alerta del ${fechaHora(a.created_at)}` }));
  if (m) {
    t.append(el('p', { text: `${ETIQUETAS[m.tipo] || m.tipo} en ${nombreUbicacion(ctx, m.ubicacion_id)} a las ${fechaHora(m.ts_efectivo)}${m.diferida ? ' (diferida)' : ''}.` }));
    const datos = [];
    if (m.precision_m !== null) datos.push(`precisión ${Math.round(m.precision_m)} m`);
    if (m.distancia_m !== null) datos.push(`a ${Math.round(m.distancia_m)} m del punto`);
    if (datos.length) t.append(el('p', { text: datos.join(', ') }));
  }
  const det = textoDetalle(a.detalle);
  if (det) t.append(el('p', { class: 'suave', text: det }));

  const acciones = el('div', { class: 'botones' });
  const caja = el('div');
  if (m && m.lat !== null && m.lng !== null) {
    acciones.append(el('a', {
      class: 'boton', target: '_blank', rel: 'noopener noreferrer',
      href: `https://www.google.com/maps/search/?api=1&query=${Number(m.lat)},${Number(m.lng)}`,
      text: 'Ver en el mapa',
    }));
  }
  if (m && m.selfie_path && puede(ctx.rol, 'ver_selfie')) {
    const b = el('button', { type: 'button', text: 'Ver selfie' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const { data, error } = await ctx.sb.storage.from('selfies').createSignedUrl(m.selfie_path, SEGUNDOS_URL_FIRMADA);
      if (error) return mostrarError(avLocal, error);
      vaciar(caja).append(el('img', { class: 'selfie', src: data.signedUrl, alt: `Selfie de la marcación de ${nombreEmpleado(ctx, m.empleado_id)}` }));
    }));
    acciones.append(b);
  }
  const avLocal = nodoAviso();
  t.append(acciones, caja, avLocal);

  if (puede(ctx.rol, 'resolver_alerta')) {
    const id = `motivo-${a.id}`;
    const motivo = el('textarea', { id, maxlength: 500 });
    const b = el('button', { type: 'button', class: 'primario', text: 'Marcar como resuelta' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const texto = textoLimpio(motivo.value);
      if (!motivoValido(texto, 5)) return aviso(avLocal, 'Escribe el motivo antes de resolver.', 'error');
      const { data, error } = await ctx.sb.from('alertas')
        .update({ estado: 'resuelta', resuelta_por: ctx.uid, resuelta_ts: new Date().toISOString(), motivo: texto })
        .eq('id', a.id).eq('estado', 'abierta').select('id');
      if (error) return mostrarError(avLocal, error);
      if (!data.length) return aviso(avLocal, 'La alerta ya no estaba abierta.', 'alerta');
      t.remove();
      aviso(avLista, 'Alerta resuelta.', 'ok');
    }));
    t.append(el('label', { for: id, text: 'Motivo (qué revisaste y qué decidiste)' }), motivo, b);
  }
  return t;
}
