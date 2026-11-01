// Pestaña Quincena: periodo, auditorías, nómina a pagar y lotes de pago.
// Todas las transiciones van por las funciones RPC de la base (controles_pago.sql).
// Total y hash del lote NO se muestran ni se rellenan: Tatiana los digita desde el
// informe de los auditores que le entrega David.
import { el, vaciar, aviso } from '../lib/dom.js';
import { puede, accionesArchivo, ultimosPorAuditor, hallazgosPendientes } from '../lib/permisos.js';
import { normalizarSha256, parsearPesos, formatoPesos, motivoValido, textoLimpio } from '../lib/validacion.js';
import {
  nombreEmpleado, fechaHora, mostrarError, nodoAviso, chip, tabla, conBoton, cargarPeriodos, selectorPeriodo,
} from './comun.js';

const COLOR = { verde: 'verde', amarillo: 'amarillo', rojo: 'rojo' };
const NOMBRE_AUDITOR = {
  H1: 'H1 · Recálculo independiente', H2: 'H2 · Reglas de cordura', H3: 'H3 · Auditor laboral (IA)',
  H4: 'H4 · Anomalías (IA)', A: 'Auditor A · Cifras y personas', B: 'Auditor B · Estructura y destino',
};

export async function montar(ctx, cont) {
  const av = nodoAviso();
  const cuerpo = el('div');
  vaciar(cont).append(el('h2', { text: 'Quincena' }), av);
  let periodos;
  try { periodos = await cargarPeriodos(ctx); } catch (e) { return mostrarError(av, e); }
  if (!periodos.length) return aviso(av, 'Todavía no hay quincenas creadas.', 'info');
  const recargar = async (id) => {
    try { periodos = await cargarPeriodos(ctx); } catch (e) { return mostrarError(av, e); }
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
  const [aud, nomina, archivos] = await Promise.all([
    ctx.sb.from('auditorias').select('id, secuencia, periodo_version, archivo_id, auditor, resultado, hallazgos, version_auditor, created_at')
      .eq('periodo_id', p.id).eq('periodo_version', p.version).order('secuencia'),
    ctx.sb.from('nomina_a_pagar').select('id, empleado_id, frente, medio_pago, valor, anotaciones, pagado, pagado_ts, periodo_version')
      .eq('periodo_id', p.id),
    ctx.sb.from('archivos_pago').select('id, periodo_version, tipo, secuencia, layout, layout_oficial, storage_path, n_registros, estado, confirmado_por, confirmado_ts, segunda_aprobacion_requerida, segunda_aprobacion_por, segunda_aprobacion_ts, descargado_ts, subido_ts, created_at')
      .eq('periodo_id', p.id).order('created_at'),
  ]);
  for (const r of [aud, nomina, archivos]) if (r.error) return mostrarError(av, r.error);
  const audIds = aud.data.map((a) => a.id);
  let resoluciones = [];
  if (audIds.length) {
    const r = await ctx.sb.from('resoluciones_hallazgos').select('auditoria_id, hallazgo_codigo, comentario, created_at').in('auditoria_id', audIds);
    if (r.error) return mostrarError(av, r.error);
    resoluciones = r.data;
  }

  // Encabezado del periodo y aprobación de la pre-nómina.
  cont.append(el('div', { class: 'tarjeta' },
    el('h3', {}, `Quincena ${p.inicio} a ${p.fin} `, chip(p.estado), ` versión ${p.version}`),
    el('p', { text: `Horas del ${p.horas_desde} al ${p.corte}. Pago por banco: ${p.fecha_pago}. Efectivo: ${p.fecha_pago_efectivo}.` }),
    p.snapshot_hash ? el('p', { class: 'suave', text: `Snapshot congelado: ${p.snapshot_hash}` }) : null,
    accionPrenomina(ctx, p, recargar)));

  // Auditorías de horas (sin archivo).
  cont.append(el('h3', { text: 'Auditoría de horas (H1 a H4)' }));
  const horas = ultimosPorAuditor(aud.data.filter((a) => !a.archivo_id));
  cont.append(horas.length ? bloqueAuditorias(ctx, horas, resoluciones, recargar)
    : el('p', { class: 'suave', text: 'Todavía no hay resultados de auditoría para esta versión.' }));

  // Nómina a pagar.
  cont.append(el('h3', { text: 'Nómina a pagar' }), tablaNomina(ctx, nomina.data));

  // Lotes de pago.
  cont.append(el('h3', { text: 'Archivos de pago' }));
  if (!archivos.data.length) cont.append(el('p', { class: 'suave', text: 'Todavía no se ha generado el archivo de pago.' }));
  for (const a of archivos.data) {
    const deArchivo = ultimosPorAuditor(aud.data.filter((x) => x.archivo_id === a.id));
    cont.append(tarjetaArchivo(ctx, a, deArchivo, resoluciones, recargar));
  }
}

function accionPrenomina(ctx, p, recargar) {
  if (p.estado !== 'cerrado' || !puede(ctx.rol, 'aprobar_prenomina')) return null;
  const av = nodoAviso();
  const b = el('button', { type: 'button', class: 'primario', text: 'Aprobar la pre-nómina' });
  b.addEventListener('click', () => conBoton(b, async () => {
    if (!confirm('¿Apruebas la pre-nómina de esta quincena? Revisa antes las auditorías y la nómina a pagar.')) return;
    const { error } = await ctx.sb.rpc('aprobar_prenomina', { p_periodo_id: p.id });
    if (error) return mostrarError(av, error);
    await recargar();
  }));
  return el('div', {}, b, av);
}

function textoHallazgo(h) {
  return h.mensaje || h.descripcion || h.detalle || h.texto || JSON.stringify(h);
}

function bloqueAuditorias(ctx, lista, resoluciones, recargar) {
  const caja = el('div');
  for (const a of lista) {
    const t = el('div', { class: 'tarjeta' },
      el('p', {}, el('strong', { text: NOMBRE_AUDITOR[a.auditor] || a.auditor }), ' ', chip(a.resultado, COLOR[a.resultado]),
        el('span', { class: 'suave', text: ` · ${fechaHora(a.created_at)} · ${a.version_auditor}` })));
    const hallazgos = Array.isArray(a.hallazgos) ? a.hallazgos : [];
    const pendientes = new Set(hallazgosPendientes(a, resoluciones).map((h) => h.codigo));
    const ul = el('ul');
    for (const h of hallazgos) {
      const res = resoluciones.find((r) => r.auditoria_id === a.id && r.hallazgo_codigo === h.codigo);
      const li = el('li', {}, el('strong', { text: `${h.codigo || 'sin código'}` }),
        h.severidad ? ` (${h.severidad})` : '', `: ${textoHallazgo(h)}`);
      if (res) li.append(el('p', { class: 'suave', text: `Resuelto: ${res.comentario}` }));
      else if (pendientes.has(h.codigo) && puede(ctx.rol, 'resolver_hallazgo')) li.append(formResolver(ctx, a, h, recargar));
      ul.append(li);
    }
    if (hallazgos.length) t.append(ul);
    if (a.resultado === 'rojo') t.append(el('p', { class: 'aviso aviso-error', text: 'Rojo: no se resuelve con comentario. Se corrige el origen y se vuelve a auditar.' }));
    caja.append(t);
  }
  return caja;
}

function formResolver(ctx, a, h, recargar) {
  const id = `res-${a.id}-${String(h.codigo).replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const txt = el('textarea', { id, maxlength: 1000 });
  const av = nodoAviso();
  const b = el('button', { type: 'button', text: 'Resolver con comentario' });
  b.addEventListener('click', () => conBoton(b, async () => {
    const c = textoLimpio(txt.value);
    if (!motivoValido(c, 10)) return aviso(av, 'El comentario debe tener al menos 10 caracteres.', 'error');
    const { error } = await ctx.sb.rpc('resolver_hallazgo', { p_auditoria_id: a.id, p_codigo: h.codigo, p_comentario: c });
    if (error) return mostrarError(av, error);
    await recargar();
  }));
  return el('div', {}, el('label', { for: id, text: 'Comentario' }), txt, b, av);
}

function tablaNomina(ctx, filas) {
  if (!filas.length) return el('p', { class: 'suave', text: 'Todavía no hay consolidado para esta quincena.' });
  const orden = [...filas].sort((a, b) => nombreEmpleado(ctx, a.empleado_id).localeCompare(nombreEmpleado(ctx, b.empleado_id)));
  const totales = { banco: 0, efectivo: 0 };
  for (const f of orden) totales[f.medio_pago] = (totales[f.medio_pago] || 0) + Number(f.valor);
  const trs = orden.map((f) => el('tr', {},
    el('td', { text: nombreEmpleado(ctx, f.empleado_id) }),
    el('td', { text: f.frente }),
    el('td', { text: f.medio_pago }),
    el('td', { class: 'num', text: formatoPesos(f.valor) }),
    el('td', { text: f.pagado ? `Sí (${fechaHora(f.pagado_ts)})` : 'No' }),
    el('td', { text: (f.anotaciones || []).join('; ') })));
  return el('div', {},
    el('p', {}, `Banco: ${formatoPesos(totales.banco)} · Efectivo: ${formatoPesos(totales.efectivo)} · Total: ${formatoPesos(totales.banco + totales.efectivo)} · ${filas.length} personas`),
    tabla(['Persona', 'Frente', 'Medio', { text: 'Valor', class: 'num' }, 'Pagado', 'Anotaciones'], trs));
}

function tarjetaArchivo(ctx, a, auditorias, resoluciones, recargar) {
  const t = el('div', { class: 'tarjeta' });
  t.append(el('p', {}, el('strong', { text: `Lote ${a.tipo} #${a.secuencia}` }), ' ', chip(a.estado),
    a.layout_oficial ? '' : chip(' formato NO oficial', 'rojo')));
  const datos = [
    `${a.n_registros} pagos`, `formato ${a.layout}`,
    a.confirmado_ts ? `total y hash confirmados ${fechaHora(a.confirmado_ts)}` : 'total y hash sin confirmar',
    a.segunda_aprobacion_requerida ? (a.segunda_aprobacion_ts ? `segunda aprobación ${fechaHora(a.segunda_aprobacion_ts)}` : 'requiere segunda aprobación') : null,
    a.descargado_ts ? `descargado ${fechaHora(a.descargado_ts)}` : null,
    a.subido_ts ? `subido ${fechaHora(a.subido_ts)}` : null,
  ].filter(Boolean);
  t.append(el('p', { text: datos.join(' · ') }));
  if (auditorias.length) t.append(bloqueAuditorias(ctx, auditorias, resoluciones, recargar));
  else t.append(el('p', { class: 'suave', text: 'Sin resultados de los auditores A y B para este lote.' }));

  const av = nodoAviso();
  for (const acc of accionesArchivo(ctx.rol, a, ctx.uid)) t.append(FORMULARIOS[acc](ctx, a, av, recargar));
  if (a.estado === 'descargado' && a.storage_path && puede(ctx.rol, 'marcar_subido')) {
    const b = el('button', { type: 'button', text: 'Descargar el archivo otra vez' });
    b.addEventListener('click', () => conBoton(b, () => descargar(ctx, a, av)));
    t.append(b);
  }
  t.append(av);
  return t;
}

async function descargar(ctx, a, av) {
  if (!a.storage_path) return aviso(av, 'El lote no tiene archivo guardado.', 'alerta');
  const nombre = a.storage_path.split('/').pop();
  const { data, error } = await ctx.sb.storage.from('archivos-pago').createSignedUrl(a.storage_path, 60, { download: nombre });
  if (error) return mostrarError(av, error);
  location.assign(data.signedUrl);
}

const FORMULARIOS = {
  confirmar_total_hash(ctx, a, av, recargar) {
    const total = el('input', { id: `total-${a.id}`, inputmode: 'decimal', autocomplete: 'off' });
    const hash = el('input', { id: `hash-${a.id}`, autocomplete: 'off', spellcheck: 'false', maxlength: 80 });
    const b = el('button', { type: 'button', class: 'primario', text: 'Confirmar total y hash' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const t = parsearPesos(total.value);
      const h = normalizarSha256(hash.value);
      if (t === null || t <= 0) return aviso(av, 'Escribe el total en pesos, por ejemplo 12.345.678.', 'error');
      if (!h) return aviso(av, 'El hash debe tener los 64 caracteres completos (números y letras de la a a la f).', 'error');
      const { data, error } = await ctx.sb.rpc('confirmar_total_hash', { p_archivo_id: a.id, p_total: t, p_sha256: h });
      if (error) return mostrarError(av, error);
      await recargar();
      alert(data ? 'Confirmado. Este lote supera el umbral: necesita la segunda aprobación antes de subirlo.' : 'Confirmado.');
    }));
    return el('div', { class: 'tarjeta' },
      el('p', { text: 'Digita el total y el hash completos tal como aparecen en el informe de los auditores. No los copies de esta pantalla: aquí no se muestran.' }),
      el('label', { for: total.id, text: 'Total del archivo (pesos)' }), total,
      el('label', { for: hash.id, text: 'Hash SHA-256 (64 caracteres)' }), hash, b);
  },

  segunda_aprobacion(ctx, a, av, recargar) {
    const c = el('textarea', { id: `seg-${a.id}`, maxlength: 1000 });
    const b = el('button', { type: 'button', class: 'primario', text: 'Dar la segunda aprobación' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const txt = textoLimpio(c.value);
      if (!motivoValido(txt, 10)) return aviso(av, 'Escribe un comentario sobre el motivo (al menos 10 caracteres).', 'error');
      const { error } = await ctx.sb.rpc('segunda_aprobacion', { p_archivo_id: a.id, p_comentario: txt });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return el('div', { class: 'tarjeta' }, el('label', { for: c.id, text: 'Comentario de la segunda aprobación' }), c, b);
  },

  marcar_descargado(ctx, a, av, recargar) {
    const b = el('button', { type: 'button', class: 'primario', text: 'Descargar el archivo' });
    b.addEventListener('click', () => conBoton(b, async () => {
      const { error } = await ctx.sb.rpc('marcar_descargado', { p_archivo_id: a.id });
      if (error) return mostrarError(av, error);
      await descargar(ctx, a, av);
      await recargar();
    }));
    return b;
  },

  marcar_subido(ctx, a, av, recargar) {
    const b = el('button', { type: 'button', class: 'primario', text: 'Ya lo subí al banco' });
    b.addEventListener('click', () => conBoton(b, async () => {
      if (!confirm('¿Ya subiste este archivo al portal de Bancolombia?')) return;
      const { error } = await ctx.sb.rpc('marcar_subido', { p_archivo_id: a.id });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return b;
  },

  confirmar_pago_banco(ctx, a, av, recargar) {
    const b = el('button', { type: 'button', class: 'primario', text: 'El banco confirmó el pago' });
    b.addEventListener('click', () => conBoton(b, async () => {
      if (!confirm('¿El banco ya confirmó que el pago se hizo?')) return;
      const { error } = await ctx.sb.rpc('confirmar_pago_banco', { p_archivo_id: a.id });
      if (error) return mostrarError(av, error);
      await recargar();
    }));
    return b;
  },
};
