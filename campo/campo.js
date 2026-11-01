// Pantalla de Alexander (líder de campo): horas por persona y por día.
// Inserta en reportes_horas (fuente 'lider', estado 'propuesto'); RLS valida el resto.
// Sin señal: guarda en IndexedDB y envía al volver la conexión (idempotency_key única).

import { configLista } from '../config.js';
import { crearSupabase, perfilActual } from '../lib/supabase.js';
import { $, el, vaciar, mostrarPantalla, aviso } from '../lib/dom.js';
import { crearCola, almacenPreferido } from '../lib/cola.js';
import { nuevoId } from '../lib/ids.js';
import { fechaBogota, fechaLarga } from '../lib/fechas.js';
import { filaReporteCampo, motivoValido, textoLimpio, esErrorDeRedSupabase, esDuplicado } from '../lib/validacion.js';

const CLAVE_PERSONAS = 'dcb_campo_personas';
const CLAVE_USUARIO = 'dcb_campo_usuario';

const { almacen } = almacenPreferido('dcb-campo');
const cola = crearCola(almacen);
let sb = null;
let usuarioId = null;
let personas = [];
let existentes = new Map(); // empleado_id -> reporte vigente de la fecha

function leerLocal(k) { try { return localStorage.getItem(k); } catch { return null; } }
function guardarLocal(k, v) { try { localStorage.setItem(k, v); } catch { /* nada */ } }

function error(texto) {
  $('#error-texto').textContent = texto;
  mostrarPantalla('error');
}

async function arrancar() {
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
  } catch { /* página aislada: sin service worker */ }
  if (!configLista()) return error('El portal todavía no está configurado. Avísale a David.');
  try {
    sb = crearSupabase();
  } catch {
    return error('No se pudo cargar la página. Revisa la señal y vuelve a abrirla.');
  }
  const { data } = await sb.auth.getSession();
  if (!data.session) return mostrarPantalla('login');
  await entrar(data.session.user.id);
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const av = $('#login-aviso');
  const b = $('#btn-login');
  b.disabled = true;
  aviso(av, 'Entrando…', 'info');
  const { data, error: e } = await sb.auth.signInWithPassword({
    email: $('#correo').value.trim(), password: $('#clave').value,
  });
  b.disabled = false;
  if (e) return aviso(av, 'No pudiste entrar. Revisa el correo y la contraseña, y que tengas señal.', 'error');
  $('#clave').value = '';
  aviso(av, '', 'info');
  await entrar(data.user.id);
});

async function salir() {
  const pend = await cola.pendientes();
  if (pend.length && !confirm('Tienes horas guardadas sin enviar. Si sales, se quedan en el celular hasta que vuelvas a entrar. ¿Salir?')) return;
  await sb.auth.signOut().catch(() => {});
  mostrarPantalla('login');
}
$('#btn-salir').addEventListener('click', salir);
$('#btn-salir-error').addEventListener('click', salir);

async function entrar(uid) {
  mostrarPantalla('cargando');
  usuarioId = uid;
  try {
    const perfil = await perfilActual(sb, uid);
    if (!perfil || !perfil.activo || perfil.rol !== 'lider_campo') {
      return error('Esta pantalla es para el líder de campo. Tu usuario no tiene ese permiso.');
    }
    guardarLocal(CLAVE_USUARIO, uid);
  } catch {
    // Sin señal: se sigue con lo guardado si es el mismo usuario.
    if (leerLocal(CLAVE_USUARIO) !== uid) return error('No hay señal para verificar tu usuario. Intenta cuando tengas conexión.');
  }
  await cargarPersonas();
  const f = $('#fecha');
  f.max = fechaBogota();
  if (!f.value) f.value = fechaBogota();
  await pintar();
  mostrarPantalla('registro');
  procesarCola();
}

async function cargarPersonas() {
  const { data, error: e } = await sb.from('empleados')
    .select('id, nombre_completo')
    .eq('grupo', 'campo').eq('activo', true)
    .order('nombre_completo');
  if (!e && data) {
    personas = data;
    guardarLocal(CLAVE_PERSONAS, JSON.stringify(data));
    return;
  }
  try { personas = JSON.parse(leerLocal(CLAVE_PERSONAS) || '[]'); } catch { personas = []; }
  aviso($('#registro-aviso'), 'No hay señal: estás viendo la lista de personas guardada.', 'alerta');
}

async function cargarExistentes(fecha) {
  existentes = new Map();
  const { data, error: e } = await sb.from('reportes_horas_vigentes')
    .select('id, empleado_id, estado, dia_trabajado, horas_extra_diurnas, horas_extra_festivas, festivo_trabajado, created_at')
    .eq('fecha', fecha)
    .in('empleado_id', personas.map((p) => p.id))
    .order('created_at');
  if (e) return false;
  for (const r of data) existentes.set(r.empleado_id, r);
  return true;
}

function resumen(r) {
  if (!r.dia_trabajado) return 'no trabajó';
  const partes = ['trabajó'];
  if (Number(r.horas_extra_diurnas)) partes.push(`${Number(r.horas_extra_diurnas)} h extra diurnas`);
  if (Number(r.horas_extra_festivas)) partes.push(`${Number(r.horas_extra_festivas)} h extra festivas`);
  if (r.festivo_trabajado) partes.push('festivo trabajado');
  return partes.join(', ');
}

async function pintar() {
  const fecha = $('#fecha').value;
  const pudo = await cargarExistentes(fecha);
  const pend = (await cola.pendientes()).filter((i) => i.fila.fecha === fecha);
  const pendPorPersona = new Map(pend.map((i) => [i.fila.empleado_id, i]));
  const caja = vaciar($('#personas'));
  if (!pudo) caja.append(el('p', { class: 'aviso aviso-alerta', text: 'Sin señal no se puede ver lo que ya enviaste ese día. Lo que guardes se envía al volver la conexión.' }));
  if (!personas.length) caja.append(el('p', { class: 'aviso aviso-info', text: 'No hay personas de campo para mostrar.' }));

  for (const p of personas) {
    const id = p.id;
    const ex = existentes.get(id);
    const pe = pendPorPersona.get(id);
    const tarjeta = el('fieldset', { class: 'tarjeta', 'data-empleado': id, 'data-nombre': p.nombre_completo });
    tarjeta.append(el('legend', { text: p.nombre_completo }));
    if (ex) {
      tarjeta.append(el('p', { class: `aviso ${ex.estado === 'aprobado' ? 'aviso-ok' : 'aviso-info'}`,
        text: ex.estado === 'aprobado'
          ? `Aprobado por Tatiana: ${resumen(ex)}. Si hay un error, avísale.`
          : `Ya enviado (${ex.estado}): ${resumen(ex)}.` }));
    }
    if (pe) tarjeta.append(el('p', { class: 'aviso aviso-alerta', text: `Guardado sin enviar: ${resumen(pe.fila)}.` }));
    if (ex && ex.estado === 'aprobado') { caja.append(tarjeta); continue; }

    const base = pe ? pe.fila : ex;
    const nombre = `trabajo-${id}`;
    const si = el('input', { type: 'radio', name: nombre, value: 'si', id: `${nombre}-si`, checked: base ? base.dia_trabajado === true : false });
    const no = el('input', { type: 'radio', name: nombre, value: 'no', id: `${nombre}-no`, checked: base ? base.dia_trabajado === false : false });
    tarjeta.append(el('div', { class: 'botones', role: 'radiogroup', 'aria-label': `¿${p.nombre_completo} trabajó?` },
      el('div', { class: 'fila-check' }, si, el('label', { for: `${nombre}-si`, text: 'Trabajó' })),
      el('div', { class: 'fila-check' }, no, el('label', { for: `${nombre}-no`, text: 'No trabajó' }))));
    const d = el('input', { id: `diurnas-${id}`, inputmode: 'decimal', 'data-campo': 'diurnas', value: base ? String(Number(base.horas_extra_diurnas) || '') : '', placeholder: '0' });
    const f = el('input', { id: `festivas-${id}`, inputmode: 'decimal', 'data-campo': 'festivas', value: base ? String(Number(base.horas_extra_festivas) || '') : '', placeholder: '0' });
    const ft = el('input', { type: 'checkbox', id: `festivo-${id}`, 'data-campo': 'festivo', checked: base ? Boolean(base.festivo_trabajado) : false });
    tarjeta.append(
      el('label', { for: `diurnas-${id}`, text: 'Horas extra diurnas' }), d,
      el('label', { for: `festivas-${id}`, text: 'Horas extra festivas' }), f,
      el('div', { class: 'fila-check' }, ft, el('label', { for: `festivo-${id}`, text: 'Festivo trabajado' })),
    );
    caja.append(tarjeta);
  }
  await pintarCola();
  actualizarMotivo();
}

function igual(a, b) {
  return a.dia_trabajado === b.dia_trabajado
    && Number(a.horas_extra_diurnas) === Number(b.horas_extra_diurnas)
    && Number(a.horas_extra_festivas) === Number(b.horas_extra_festivas)
    && Boolean(a.festivo_trabajado) === Boolean(b.festivo_trabajado);
}

// Lee el formulario: filas a enviar, errores y si hay correcciones.
function leerFormulario() {
  const fecha = $('#fecha').value;
  const filas = [];
  const errores = [];
  let sinMarcar = 0;
  let correcciones = 0;
  for (const t of document.querySelectorAll('#personas fieldset[data-empleado]')) {
    const id = t.dataset.empleado;
    const radio = t.querySelector('input[type=radio]:checked');
    if (!radio) { if (t.querySelector('input[type=radio]')) sinMarcar++; continue; }
    const r = filaReporteCampo({
      empleadoId: id, fecha, trabajo: radio.value === 'si',
      extrasDiurnas: t.querySelector('[data-campo=diurnas]').value,
      extrasFestivas: t.querySelector('[data-campo=festivas]').value,
      festivoTrabajado: t.querySelector('[data-campo=festivo]').checked,
    });
    if (r.errores.length) { errores.push(`${t.dataset.nombre}: ${r.errores.join(' ')}`); continue; }
    const ex = existentes.get(id);
    if (ex && igual(ex, r.fila)) continue;
    if (ex) correcciones++;
    filas.push({ fila: r.fila, nombre: t.dataset.nombre, reemplaza: ex ? ex.id : null });
  }
  return { fecha, filas, errores, sinMarcar, correcciones };
}

function actualizarMotivo() {
  $('#caja-motivo').hidden = leerFormulario().correcciones === 0;
}
$('#personas').addEventListener('change', actualizarMotivo);
$('#fecha').addEventListener('change', async () => {
  if ($('#fecha').value > fechaBogota()) $('#fecha').value = fechaBogota();
  await pintar();
});

$('#btn-guardar').addEventListener('click', async () => {
  const b = $('#btn-guardar');
  const av = $('#guardar-aviso');
  if (b.disabled) return;
  const { fecha, filas, errores, sinMarcar, correcciones } = leerFormulario();
  if (errores.length) return aviso(av, errores.join(' '), 'error');
  if (!filas.length) {
    return aviso(av, sinMarcar ? 'Marca para cada persona si trabajó o no.' : 'No hay cambios para guardar.', 'alerta');
  }
  const motivo = textoLimpio($('#motivo').value);
  if (correcciones && !motivoValido(motivo, 5)) return aviso(av, 'Escribe por qué cambiaste las horas que ya habías enviado.', 'error');

  b.disabled = true;
  try {
    // Lo que estaba guardado sin enviar para la misma persona y fecha se reemplaza.
    const viejos = (await cola.pendientes()).filter((i) => i.fila.fecha === fecha
      && filas.some((f) => f.fila.empleado_id === i.fila.empleado_id));
    for (const v of viejos) await cola.quitar(v.id);
    for (const f of filas) {
      const fila = {
        ...f.fila, fuente: 'lider', estado: 'propuesto', reportado_por: usuarioId, idempotency_key: nuevoId(),
      };
      if (f.reemplaza) { fila.reemplaza_a = f.reemplaza; fila.motivo = motivo; }
      await cola.agregar({ id: fila.idempotency_key, nombre: f.nombre, fila });
    }
  } catch {
    b.disabled = false;
    return aviso(av, 'No se pudo guardar en el celular. Intenta otra vez.', 'error');
  }
  $('#motivo').value = '';
  const r = await procesarCola();
  b.disabled = false;
  const n = filas.length;
  const faltan = sinMarcar ? ` Te ${sinMarcar === 1 ? 'falta 1 persona' : `faltan ${sinMarcar} personas`} por marcar.` : '';
  if (r && r.detenida) {
    aviso(av, `Guardado en el celular (${n} ${n === 1 ? 'persona' : 'personas'}). Se enviará cuando haya señal.${faltan}`, 'alerta');
  } else if (r && r.fallidas.length) {
    aviso(av, 'Algunas horas no se pudieron enviar. Revisa el mensaje arriba.', 'error');
  } else {
    aviso(av, `Listo: enviaste las horas del ${fechaLarga(fecha)}.${faltan}`, 'ok');
  }
  await pintar();
});

// ------------------------------------------------------------ cola
async function enviarDeCola(item) {
  const { error: e, status } = await sb.from('reportes_horas').insert(item.fila);
  if (!e || esDuplicado(e)) return { accion: 'ok' };
  if (esErrorDeRedSupabase(e, status)) {
    if (status === 401) await sb.auth.refreshSession().catch(() => {});
    return { accion: 'reintentar' };
  }
  return { accion: 'descartar', mensaje: e.message };
}

let temporizador = null;
async function procesarCola() {
  if (!sb) return null;
  const r = await cola.procesar(enviarDeCola);
  clearTimeout(temporizador);
  if (r.pendientes > 0) temporizador = setTimeout(procesarCola, 60000);
  if ((r.enviadas.length || r.fallidas.length) && !$('[data-pantalla="registro"]').hidden) await pintar();
  else await pintarCola();
  return r;
}

async function pintarCola() {
  const pend = await cola.pendientes();
  $('#pendientes').hidden = pend.length === 0;
  $('#pendientes-texto').textContent = `Tienes ${pend.length} ${pend.length === 1 ? 'reporte guardado' : 'reportes guardados'} sin enviar. Se envían solos cuando haya señal.`;
  const caja = vaciar($('#fallidas'));
  for (const f of await cola.fallidas()) {
    caja.append(el('div', { class: 'aviso aviso-error', role: 'alert' },
      el('p', { text: `No se pudo enviar ${f.nombre} (${fechaLarga(f.fila.fecha)}): ${f.mensaje}` }),
      el('button', { type: 'button', text: 'Entendido', onclick: async () => { await cola.quitar(f.id); pintarCola(); } })));
  }
}

$('#btn-enviar-pendientes').addEventListener('click', () => procesarCola());
window.addEventListener('online', () => { procesarCola(); });
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') procesarCola(); });

arrancar();
