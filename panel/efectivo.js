// Pestaña Efectivo de campo: confirmar, entregar, imprimir y cruzar la planilla.
// El total de la planilla no se muestra antes de confirmarlo: Tatiana lo digita.
import { $, el, vaciar, aviso } from '../lib/dom.js';
import { accionesPlanilla } from '../lib/permisos.js';
import { parsearPesos, formatoPesos, textoLimpio } from '../lib/validacion.js';
import { nombreEmpleado, fechaHora, mostrarError, nodoAviso, chip, tabla, conBoton, cargarPeriodos, selectorPeriodo } from './comun.js';

export async function montar(ctx, cont) {
  const av = nodoAviso();
  const cuerpo = el('div');
  vaciar(cont).append(el('h2', { text: 'Efectivo de campo' }), av);
  let periodos;
  try { periodos = await cargarPeriodos(ctx); } catch (e) { return mostrarError(av, e); }
  if (!periodos.length) return aviso(av, 'Todavía no hay quincenas creadas.', 'info');
  const recargar = async (id) => {
    const p = periodos.find((x) => x.id === id) || periodos[0];
    await pintar(ctx, p, cuerpo, () => recargar(p.id));
  };
  cont.append(selectorPeriodo(periodos, periodos[0].id, (id) => recargar(id)), cuerpo);
  await recargar(periodos[0].id);
}

async function pintar(ctx, p, cont, recargar) {
  vaciar(cont);
  const av = nodoAviso();
  cont.append(av);
  const { data: planillas, error } = await ctx.sb.from('planillas_efectivo')
    .select('id, periodo_version, total, n_personas, estado, confirmada_por, confirmada_ts, entregada_por, entregada_ts, foto_planilla_path, cruzada_ts, observaciones, created_at')
    .eq('periodo_id', p.id).order('created_at', { ascending: false });
  if (error) return mostrarError(av, error);
  if (!planillas.length) return aviso(av, 'Esta quincena no tiene planilla de efectivo.', 'info');
  const ids = planillas.map((x) => x.id);
  const { data: lineas, error: e2 } = await ctx.sb.from('planillas_efectivo_lineas')
    .select('id, planilla_id, empleado_id, valor, firmo, observacion').in('planilla_id', ids);
  if (e2) return mostrarError(av, e2);
  for (const pl of planillas) {
    const ls = lineas.filter((l) => l.planilla_id === pl.id)
      .sort((a, b) => nombreEmpleado(ctx, a.empleado_id).localeCompare(nombreEmpleado(ctx, b.empleado_id)));
    cont.append(tarjetaPlanilla(ctx, p, pl, ls, recargar));
  }
}

function tarjetaPlanilla(ctx, p, pl, lineas, recargar) {
  const t = el('div', { class: 'tarjeta' });
  const confirmada = pl.estado !== 'generada';
  t.append(el('p', {}, el('strong', { text: `Planilla versión ${pl.periodo_version}` }), ' ', chip(pl.estado),
    ` · ${pl.n_personas} personas${confirmada && pl.estado !== 'anulada' ? ` · total ${formatoPesos(pl.total)}` : ''}`));
  const hitos = [
    pl.confirmada_ts ? `confirmada ${fechaHora(pl.confirmada_ts)}` : null,
    pl.entregada_ts ? `entregada ${fechaHora(pl.entregada_ts)}` : null,
    pl.cruzada_ts ? `cruzada ${fechaHora(pl.cruzada_ts)}` : null,
  ].filter(Boolean);
  if (hitos.length) t.append(el('p', { class: 'suave', text: hitos.join(' · ') }));

  t.append(tabla(['Persona', { text: 'Valor', class: 'num' }, 'Firmó', 'Observación'], lineas.map((l) => el('tr', {},
    el('td', { text: nombreEmpleado(ctx, l.empleado_id) }),
    el('td', { class: 'num', text: formatoPesos(l.valor) }),
    el('td', { text: l.firmo === null ? '—' : (l.firmo ? 'Sí' : 'No') }),
    el('td', { text: l.observacion || '' })))));

  const av = nodoAviso();
  const acciones = accionesPlanilla(ctx.rol, pl, ctx.uid);
  for (const acc of acciones) t.append(ACCIONES[acc](ctx, p, pl, lineas, av, recargar));
  if (pl.foto_planilla_path) {
    const b = el('button', { type: 'button', text: 'Ver la foto de la planilla firmada' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const { data, error } = await ctx.sb.storage.from('soportes').createSignedUrl(pl.foto_planilla_path, 120);
      if (error) return mostrarError(av, error);
      window.open(data.signedUrl, '_blank', 'noopener,noreferrer');
    }));
    t.append(b);
  }
  t.append(av);
  return t;
}

function imprimir(ctx, p, pl, lineas) {
  const cont = vaciar($('#planilla-impresion'));
  cont.append(
    el('h1', { text: 'Dreams Can Bloom · Planilla de entrega de efectivo' }),
    el('p', { text: `Quincena del ${p.inicio} al ${p.fin}. Fecha de pago: ${p.fecha_pago_efectivo}.` }),
    el('p', { text: 'Cada persona revisa el valor, recibe el dinero y firma.' }),
    el('table', {},
      el('thead', {}, el('tr', {}, ['#', 'Nombre', 'Valor', 'Firma', 'Observación'].map((h) => el('th', { text: h })))),
      el('tbody', {}, lineas.map((l, i) => el('tr', {},
        el('td', { text: String(i + 1) }),
        el('td', { text: nombreEmpleado(ctx, l.empleado_id) }),
        el('td', { class: 'num', text: formatoPesos(l.valor) }),
        el('td', { class: 'firma', text: '' }),
        el('td', { text: '' })))),
      el('tfoot', {}, el('tr', {},
        el('td', { text: '' }), el('th', { text: 'Total' }),
        el('th', { class: 'num', text: formatoPesos(pl.total) }), el('td', { text: '' }), el('td', { text: '' })))),
    el('p', { text: 'Entregó: ______________________________   Fecha: ____________' }),
    el('p', { text: 'Cruzó contra el sistema: ______________________________   Fecha: ____________' }),
  );
  document.body.classList.add('imprime-planilla');
  window.addEventListener('afterprint', () => { document.body.classList.remove('imprime-planilla'); vaciar(cont); }, { once: true });
  window.print();
}

const ACCIONES = {
  imprimir(ctx, p, pl, lineas) {
    const b = el('button', { type: 'button', text: 'Imprimir planilla de entrega' });
    b.addEventListener('click', () => imprimir(ctx, p, pl, lineas));
    return b;
  },

  confirmar_planilla(ctx, p, pl, lineas, av, recargar) {
    const total = el('input', { id: `ef-total-${pl.id}`, inputmode: 'decimal', autocomplete: 'off' });
    const b = el('button', { type: 'button', class: 'primario', text: 'Confirmar el total' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const t = parsearPesos(total.value);
      if (t === null || t < 0) return aviso(av, 'Escribe el total en pesos, por ejemplo 2.345.000.', 'error');
      const { error } = await ctx.sb.rpc('confirmar_planilla_efectivo', { p_planilla_id: pl.id, p_total: t });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return el('div', { class: 'tarjeta' },
      el('p', { text: 'Revisa el valor de cada persona y digita el total que verificaste contra la nómina.' }),
      el('label', { for: total.id, text: 'Total del efectivo (pesos)' }), total, b);
  },

  registrar_entrega(ctx, p, pl, lineas, av, recargar) {
    const b = el('button', { type: 'button', class: 'primario', text: 'Registrar que entregué el efectivo' });
    b.addEventListener('click', () => conBoton(b, async () => {
      if (!confirm('¿Ya entregaste el efectivo y cada persona firmó la planilla?')) return;
      const { error } = await ctx.sb.rpc('registrar_entrega_efectivo', { p_planilla_id: pl.id });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return b;
  },

  cruzar_planilla(ctx, p, pl, lineas, av, recargar) {
    const filas = lineas.map((l) => {
      const n = `firmo-${l.id}`;
      const si = el('input', { type: 'radio', name: n, value: 'si', id: `${n}-si` });
      const no = el('input', { type: 'radio', name: n, value: 'no', id: `${n}-no` });
      const obs = el('input', { id: `obs-${l.id}`, maxlength: 200, 'aria-label': `Observación de ${nombreEmpleado(ctx, l.empleado_id)}` });
      return { l, si, no, obs, tr: el('tr', {},
        el('td', { text: nombreEmpleado(ctx, l.empleado_id) }),
        el('td', {}, el('div', { class: 'fila-check' }, si, el('label', { for: si.id, text: 'Sí' }), no, el('label', { for: no.id, text: 'No' }))),
        el('td', {}, obs)) };
    });
    const foto = el('input', { type: 'file', id: `foto-${pl.id}`, accept: 'image/jpeg,image/png,image/webp,application/pdf' });
    const b = el('button', { type: 'button', class: 'primario', text: 'Cruzar la planilla' });
    b.addEventListener('click', () => conBoton(b, async () => {
      if (filas.some((f) => !f.si.checked && !f.no.checked)) return aviso(av, 'Marca para cada persona si firmó o no.', 'error');
      const archivo = foto.files && foto.files[0];
      if (!archivo) return aviso(av, 'Falta la foto de la planilla firmada.', 'error');
      if (archivo.size > 10 * 1024 * 1024) return aviso(av, 'La foto pesa más de 10 MB. Toma una con menos resolución.', 'error');
      const ext = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' }[archivo.type];
      if (!ext) return aviso(av, 'La foto debe ser JPG, PNG, WEBP o PDF.', 'error');
      const ruta = `planillas/${p.id}/${pl.id}-${Date.now()}.${ext}`;
      aviso(av, 'Subiendo la foto…', 'info');
      const up = await ctx.sb.storage.from('soportes').upload(ruta, archivo, { contentType: archivo.type, upsert: false });
      if (up.error) return mostrarError(av, up.error);
      const pLineas = filas.map((f) => ({
        empleado_id: f.l.empleado_id, firmo: f.si.checked, observacion: textoLimpio(f.obs.value) || null,
      }));
      const { error } = await ctx.sb.rpc('cruzar_planilla_efectivo', { p_planilla_id: pl.id, p_foto_path: ruta, p_lineas: pLineas });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return el('div', { class: 'tarjeta' },
      el('h3', { text: 'Cruzar la planilla firmada' }),
      tabla(['Persona', 'Firmó', 'Observación'], filas.map((f) => f.tr)),
      el('label', { for: foto.id, text: 'Foto de la planilla firmada' }), foto, b);
  },
};
