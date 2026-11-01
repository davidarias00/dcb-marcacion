// Pantalla de marcación (QR + selfie en vivo + GPS). Contrato: docs/11-api-portal.md.
// No usa supabase-js: llama las edge functions con fetch. No escribe datos personales en consola.

import { SUPABASE_ANON_KEY, configLista, urlFunciones } from '../config.js';
import { $, el, vaciar, mostrarPantalla, aviso } from '../lib/dom.js';
import { detectarNavegadorInterno, instruccionesAbrir, urlIntentChrome } from '../lib/navegador.js';
import { ETIQUETAS, TIPOS_VISIBLES, sugerirTipo, leerTokenQR, textoMotivo, cuerpoMarcar } from '../lib/marcacion.js';
import { crearClienteApi, esDispositivoInvalido, esDefinitivo } from '../lib/api.js';
import { demoActiva, fetchDemo, TOKEN_QR_DEMO } from '../lib/demo.js';
import { crearCola, almacenPreferido } from '../lib/cola.js';
import { nuevoId } from '../lib/ids.js';
import { fechaBogota, horaBogota, isoBogota, fechaLarga } from '../lib/fechas.js';
import { camaraDisponible, abrirCamara, cerrarCamara, capturar, mensajeErrorCamara } from './camara.js';
import { iniciarGPS, textoGPS } from './gps.js';

const CLAVE_TOKEN = 'dcb_dispositivo';
const CLAVE_ANTERIOR = 'dcb_dispositivo_anterior';
const CLAVE_ESTADO = 'dcb_estado_hoy';

const DEMO = demoActiva(location.search, configLista());
const qr = leerTokenQR(location.search) || (DEMO ? TOKEN_QR_DEMO : null);
const { almacen, persistente } = almacenPreferido('dcb-marcacion');
const cola = crearCola(almacen);
let api = null;

// ------------------------------------------------------------ almacenamiento local
// En modo demostración, si el navegador no deja guardar (página aislada), se usa memoria:
// la vinculación dura mientras la página esté abierta. Fuera de la demostración no se permite.
const memoriaDemo = new Map();
function leerLocal(clave) {
  try { return localStorage.getItem(clave); } catch { return DEMO ? memoriaDemo.get(clave) ?? null : null; }
}
function guardarLocal(clave, valor) {
  try { localStorage.setItem(clave, valor); return true; } catch {
    if (!DEMO) return false;
    memoriaDemo.set(clave, valor);
    return true;
  }
}
function borrarLocal(clave) {
  memoriaDemo.delete(clave);
  try { localStorage.removeItem(clave); } catch { /* nada */ }
}
const token = () => leerLocal(CLAVE_TOKEN);

// Quita el token (revocado o no vinculado) pero lo recuerda para avisarle al servidor
// al vincular de nuevo: así detecta un celular que marca por dos personas.
function soltarToken() {
  const t = token();
  if (t) guardarLocal(CLAVE_ANTERIOR, t);
  borrarLocal(CLAVE_TOKEN);
  borrarLocal(CLAVE_ESTADO);
}

function estadoGuardado() {
  try {
    const e = JSON.parse(leerLocal(CLAVE_ESTADO) || 'null');
    return e && e.fecha === fechaBogota() ? e : null;
  } catch { return null; }
}

// ------------------------------------------------------------ arranque
function error(texto) {
  $('#error-texto').textContent = texto;
  mostrarPantalla('error');
}

function arrancar() {
  // En páginas aisladas (sandbox) leer navigator.serviceWorker lanza un error: se ignora.
  try {
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('../sw.js', { scope: '../' }).catch(() => {});
  } catch { /* sin service worker: la página funciona igual, solo no abre sin señal */ }
  if (DEMO) {
    api = crearClienteApi({ base: 'demo', apikey: 'demo', fetchImpl: fetchDemo });
    const banda = document.createElement('p');
    banda.className = 'aviso aviso-alerta';
    banda.textContent = 'Modo demostración: la cámara y el GPS son reales, pero no se guarda nada ni se envía WhatsApp. El código es 123456.';
    document.querySelector('main').prepend(banda);
  } else {
    if (!configLista()) return error('El portal todavía no está configurado. Avísale a David.');
    api = crearClienteApi({ base: urlFunciones(), apikey: SUPABASE_ANON_KEY });
  }

  const det = detectarNavegadorInterno(navigator.userAgent);
  if (det.interno && !sessionStorageSeguir()) return pantallaInterno(det);
  continuar();
}

function sessionStorageSeguir() {
  try { return sessionStorage.getItem('dcb_seguir_interno') === '1'; } catch { return false; }
}

function continuar() {
  if (!camaraDisponible()) {
    return error('Este navegador no deja usar la cámara. Abre el enlace en Chrome (Android) o Safari (iPhone) actualizado.');
  }
  if (!token()) return pantallaCedula();
  iniciar();
}

function pantallaInterno(det) {
  const caja = vaciar($('#interno-texto'));
  for (const linea of instruccionesAbrir(det)) caja.append(el('p', { text: linea }));
  if (det.plataforma === 'android') {
    const a = $('#interno-chrome');
    a.href = urlIntentChrome(location.href);
    a.hidden = false;
  }
  $('#interno-copiar').onclick = async () => {
    let ok = false;
    try { await navigator.clipboard.writeText(location.href); ok = true; } catch { ok = false; }
    $('#interno-copiado').textContent = ok
      ? 'Enlace copiado.'
      : 'No se pudo copiar. Mantén presionada la dirección de la página para copiarla.';
  };
  $('#interno-seguir').onclick = () => {
    try { sessionStorage.setItem('dcb_seguir_interno', '1'); } catch { /* nada */ }
    continuar();
  };
  mostrarPantalla('interno');
}

// ------------------------------------------------------------ vinculación
let cedulaActual = '';
let ultimoEnvioCodigo = 0;

function pantallaCedula(mensaje) {
  const av = $('#cedula-aviso');
  aviso(av, mensaje || '', 'alerta');
  $('#cedula').value = '';
  mostrarPantalla('cedula');
}

$('#form-cedula').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const av = $('#cedula-aviso');
  const cedula = $('#cedula').value.replace(/[\s.,-]/g, '');
  if (!/^\d{5,12}$/.test(cedula)) {
    aviso(av, 'Escribe tu cédula solo con números, sin puntos.', 'error');
    $('#cedula').focus();
    return;
  }
  await solicitarCodigo(cedula, $('#btn-cedula'), av);
});

async function solicitarCodigo(cedula, boton, av) {
  boton.disabled = true;
  aviso(av, 'Enviando…', 'info');
  const cuerpo = { cedula };
  if (qr) cuerpo.qr = qr;
  const r = await api.llamar('vincular-solicitar', { cuerpo, timeout: 20000 });
  boton.disabled = false;
  if (r.tipo === 'red') {
    aviso(av, 'No hay señal en este momento. Intenta otra vez cuando tengas conexión.', 'error');
    return;
  }
  if (r.tipo === 'error') {
    aviso(av, r.mensaje, 'error');
    return;
  }
  cedulaActual = cedula;
  ultimoEnvioCodigo = Date.now();
  aviso(av, '', 'info');
  $('#codigo-mensaje').textContent = (r.datos && r.datos.mensaje)
    || 'Si tus datos están registrados, te llegó un código por WhatsApp.';
  $('#codigo').value = '';
  aviso($('#codigo-aviso'), '', 'info');
  mostrarPantalla('codigo');
}

$('#form-codigo').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const av = $('#codigo-aviso');
  const codigo = $('#codigo').value.replace(/\D/g, '');
  if (codigo.length !== 6) {
    aviso(av, 'El código tiene 6 números.', 'error');
    return;
  }
  const boton = $('#btn-codigo');
  boton.disabled = true;
  aviso(av, 'Vinculando…', 'info');
  const r = await api.llamar('vincular-confirmar', {
    cuerpo: { cedula: cedulaActual, codigo }, dispositivoAnterior: leerLocal(CLAVE_ANTERIOR) || undefined, timeout: 20000,
  });
  boton.disabled = false;
  if (r.tipo === 'red') return aviso(av, 'No hay señal en este momento. Intenta otra vez.', 'error');
  if (r.tipo === 'error') return aviso(av, r.mensaje, 'error');
  const t = r.datos && r.datos.token_dispositivo;
  if (!t || !guardarLocal(CLAVE_TOKEN, t)) {
    return aviso(av, 'Tu navegador no deja guardar la vinculación. Si estás en modo incógnito o privado, abre el enlace en una pestaña normal.', 'error');
  }
  cedulaActual = '';
  borrarLocal(CLAVE_ANTERIOR);
  borrarLocal(CLAVE_ESTADO);
  iniciar({ aviso: `Listo, tu celular quedó vinculado${r.datos.nombre ? `, ${r.datos.nombre}` : ''}.` });
});

$('#btn-reenviar').addEventListener('click', async () => {
  const av = $('#codigo-aviso');
  const espera = 60000 - (Date.now() - ultimoEnvioCodigo);
  if (espera > 0) {
    aviso(av, `Espera ${Math.ceil(espera / 1000)} segundos antes de pedir otro código.`, 'alerta');
    return;
  }
  await solicitarCodigo(cedulaActual, $('#btn-reenviar'), av);
});
$('#btn-cambiar-cedula').addEventListener('click', () => pantallaCedula());

// ------------------------------------------------------------ inicio
let estado = { nombre: '', hoy: [], siguiente: null };

async function iniciar(opciones = {}) {
  mostrarPantalla('cargando');
  const guardado = estadoGuardado();
  if (guardado) estado = guardado;
  let avisoInicio = opciones.aviso || '';
  let tipoAviso = 'ok';

  const r = await api.llamar('estado-hoy', { metodo: 'GET', dispositivo: token(), timeout: 10000 });
  if (r.tipo === 'ok') {
    estado = {
      fecha: fechaBogota(),
      nombre: r.datos.nombre || '',
      hoy: Array.isArray(r.datos.hoy) ? r.datos.hoy : [],
      siguiente: r.datos.siguiente || null,
    };
    guardarLocal(CLAVE_ESTADO, JSON.stringify(estado));
  } else if (esDispositivoInvalido(r)) {
    soltarToken();
    return pantallaCedula(r.mensaje);
  } else if (r.tipo === 'red') {
    avisoInicio = 'No hay señal. Igual puedes marcar: tu marcación se guarda en el celular y se envía cuando vuelva la señal.';
    tipoAviso = 'alerta';
  } else {
    avisoInicio = r.mensaje;
    tipoAviso = 'error';
  }
  await pintarInicio(avisoInicio, tipoAviso);
  procesarCola();
}

async function pintarInicio(textoAviso, tipoAviso = 'ok') {
  $('#saludo').textContent = estado.nombre ? `Hola, ${estado.nombre}` : 'Hola';
  aviso($('#inicio-aviso'), textoAviso, tipoAviso);
  $('#sin-qr').hidden = Boolean(qr);

  const hoyFecha = fechaBogota();
  const pend = (await cola.pendientes()).filter((i) => i.fecha === hoyFecha);
  const todasPend = await cola.pendientes();

  // Botones de tipo: el sugerido grande; los demás debajo.
  const sugerido = sugerirTipo({ siguienteServidor: estado.siguiente, hoy: estado.hoy, pendientes: pend });
  const caja = vaciar($('#botones-tipo'));
  caja.append(el('button', {
    type: 'button', class: 'grande primario', 'data-tipo': sugerido, disabled: !qr,
    text: `Marcar ${ETIQUETAS[sugerido].toLowerCase()}`,
  }));
  const otros = TIPOS_VISIBLES.filter((t) => t !== sugerido);
  caja.append(el('p', { class: 'suave', text: '¿Necesitas marcar la otra?' }));
  const fila = el('div', { class: 'botones' });
  for (const t of otros) fila.append(el('button', { type: 'button', 'data-tipo': t, disabled: !qr, text: ETIQUETAS[t] }));
  caja.append(fila);

  // Lista de hoy: lo del servidor y lo guardado sin enviar.
  const lista = vaciar($('#lista-hoy'));
  for (const m of estado.hoy) {
    lista.append(el('li', {}, el('span', { text: ETIQUETAS[m.tipo] || m.tipo }),
      el('strong', { text: `${m.hora}${m.ubicacion ? ` · ${m.ubicacion}` : ''}` })));
  }
  for (const p of pend) {
    lista.append(el('li', {}, el('span', { text: `${ETIQUETAS[p.tipo]} (guardada, sin enviar)` }),
      el('strong', { text: p.hora })));
  }
  $('#hoy-vacio').hidden = estado.hoy.length + pend.length > 0;

  // Pendientes por enviar.
  $('#pendientes').hidden = todasPend.length === 0;
  $('#pendientes-texto').textContent = todasPend.length === 1
    ? 'Tienes 1 marcación guardada sin enviar. Se enviará sola cuando haya señal.'
    : `Tienes ${todasPend.length} marcaciones guardadas sin enviar. Se enviarán solas cuando haya señal.`;

  // Las que el servidor rechazó.
  const cajaF = vaciar($('#fallidas'));
  for (const f of await cola.fallidas()) {
    cajaF.append(el('div', { class: 'aviso aviso-error', role: 'alert' },
      el('p', { text: `No se pudo enviar tu marcación de ${ETIQUETAS[f.tipo].toLowerCase()} del ${fechaLarga(f.fecha)} a las ${f.hora}.` }),
      el('p', { text: f.mensaje }),
      el('p', { text: 'Escríbele a Tatiana por WhatsApp hoy mismo con la hora.' }),
      el('button', { type: 'button', onclick: async () => { await cola.quitar(f.id); pintarInicio(''); }, text: 'Entendido' })));
  }
  mostrarPantalla('inicio');
}

$('#botones-tipo').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tipo]');
  if (!b || b.disabled) return;
  empezarMarcacion(b.dataset.tipo);
});

$('#btn-enviar-pendientes').addEventListener('click', async () => {
  const b = $('#btn-enviar-pendientes');
  b.disabled = true;
  const r = await procesarCola();
  b.disabled = false;
  if (r && r.detenida === 'sin_conexion') aviso($('#inicio-aviso'), 'Todavía no hay señal. Se enviarán solas cuando vuelva.', 'alerta');
});

// ------------------------------------------------------------ cola offline
async function enviarDeCola(item) {
  const t = token();
  if (!t) return { accion: 'detener', motivo: 'sin_token' };
  const r = await api.llamar('marcar', { cuerpo: item.cuerpo, dispositivo: t });
  if (r.tipo === 'ok') return { accion: 'ok', respuesta: r.datos };
  if (r.tipo === 'red') return { accion: 'reintentar' };
  if (esDispositivoInvalido(r)) return { accion: 'detener', motivo: 'dispositivo' };
  if (esDefinitivo(r)) return { accion: 'descartar', mensaje: r.mensaje };
  return { accion: 'reintentar' };
}

let temporizadorCola = null;
async function procesarCola() {
  if (!token()) return null;
  const r = await cola.procesar(enviarDeCola);
  if (r.enviadas.length || r.fallidas.length) {
    if (!$('[data-pantalla="inicio"]').hidden) {
      const n = r.enviadas.length;
      await pintarInicio(n ? (n === 1 ? 'Se envió 1 marcación que estaba guardada.' : `Se enviaron ${n} marcaciones que estaban guardadas.`) : '', 'ok');
    }
  }
  clearTimeout(temporizadorCola);
  if (r.pendientes > 0) temporizadorCola = setTimeout(procesarCola, 60000);
  return r;
}

window.addEventListener('online', () => { procesarCola(); });
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') procesarCola();
});

// ------------------------------------------------------------ cámara, GPS y envío
let marcacion = null; // { tipo, stream, gps, foto, tsDispositivo, idempotencyKey, ocupado }

async function empezarMarcacion(tipo) {
  if (marcacion) return;
  marcacion = { tipo, stream: null, gps: null, foto: null, ocupado: false };
  $('#camara-titulo').textContent = `${ETIQUETAS[tipo]}: toma tu selfie`;
  aviso($('#camara-aviso'), '', 'info');
  $('#caja-video').hidden = false;
  $('#caja-foto').hidden = true;
  $('#btn-tomar').hidden = false;
  $('#btn-tomar').disabled = true;
  $('#btn-enviar').hidden = true;
  $('#btn-otra').hidden = true;
  $('#btn-cancelar').disabled = false;
  mostrarPantalla('camara');

  const gpsEstado = $('#gps-estado');
  gpsEstado.textContent = 'Buscando tu ubicación…';
  marcacion.gps = iniciarGPS((e) => { gpsEstado.textContent = textoGPS(e); });

  await encenderCamara();
}

async function encenderCamara() {
  try {
    marcacion.stream = await abrirCamara($('#video'));
    $('#btn-tomar').disabled = false;
  } catch (e) {
    aviso($('#camara-aviso'), mensajeErrorCamara(e), 'error');
  }
}

$('#btn-tomar').addEventListener('click', () => {
  if (!marcacion || marcacion.ocupado) return;
  try {
    marcacion.foto = capturar($('#video'));
  } catch (e) {
    aviso($('#camara-aviso'), e.message, 'error');
    return;
  }
  marcacion.tsDispositivo = isoBogota(new Date());
  marcacion.idempotencyKey = nuevoId();
  cerrarCamara(marcacion.stream, $('#video'));
  marcacion.stream = null;
  $('#foto').src = marcacion.foto.dataUrl;
  $('#caja-video').hidden = true;
  $('#caja-foto').hidden = false;
  $('#btn-tomar').hidden = true;
  $('#btn-enviar').hidden = false;
  $('#btn-enviar').disabled = false;
  $('#btn-otra').hidden = false;
  $('#btn-enviar').focus();
});

$('#btn-otra').addEventListener('click', async () => {
  if (!marcacion || marcacion.ocupado) return;
  marcacion.foto = null;
  $('#caja-foto').hidden = true;
  $('#caja-video').hidden = false;
  $('#btn-enviar').hidden = true;
  $('#btn-otra').hidden = true;
  $('#btn-tomar').hidden = false;
  $('#btn-tomar').disabled = true;
  await encenderCamara();
});

$('#btn-cancelar').addEventListener('click', () => {
  if (marcacion && marcacion.ocupado) return;
  terminarMarcacion();
  pintarInicio('');
});

function terminarMarcacion() {
  if (!marcacion) return;
  cerrarCamara(marcacion.stream, $('#video'));
  if (marcacion.gps) marcacion.gps.detener();
  marcacion = null;
  $('#foto').removeAttribute('src');
}

$('#btn-enviar').addEventListener('click', async () => {
  if (!marcacion || marcacion.ocupado || !marcacion.foto) return;
  marcacion.ocupado = true;
  const bEnviar = $('#btn-enviar');
  bEnviar.disabled = true;
  $('#btn-otra').disabled = true;
  $('#btn-cancelar').disabled = true;
  const textoOriginal = bEnviar.textContent;
  bEnviar.textContent = 'Tomando la ubicación…';
  const { posicion } = await marcacion.gps.esperar();
  bEnviar.textContent = 'Enviando…';

  const base = {
    qr, tipo: marcacion.tipo, idempotencyKey: marcacion.idempotencyKey, posicion,
    selfieBase64: marcacion.foto.base64, tsDispositivo: marcacion.tsDispositivo,
  };
  const m = marcacion;
  let r = { tipo: 'red', status: 0 };
  if (navigator.onLine !== false) {
    r = await api.llamar('marcar', { cuerpo: cuerpoMarcar({ ...base, diferida: false }), dispositivo: token() });
    if (r.tipo === 'red' && navigator.onLine !== false) {
      // Un reintento corto con la misma clave (no duplica).
      await new Promise((ok) => setTimeout(ok, 1500));
      r = await api.llamar('marcar', { cuerpo: cuerpoMarcar({ ...base, diferida: false }), dispositivo: token() });
    }
  }

  bEnviar.textContent = textoOriginal;
  bEnviar.disabled = false;
  $('#btn-otra').disabled = false;
  $('#btn-cancelar').disabled = false;
  m.ocupado = false;

  if (r.tipo === 'ok') {
    terminarMarcacion();
    return mostrarResultado(r.datos);
  }
  if (r.tipo === 'red') {
    const fecha = fechaBogota(new Date(Date.parse(m.tsDispositivo)));
    const hora = horaBogota(new Date(Date.parse(m.tsDispositivo)));
    let guardada = true;
    try {
      await cola.agregar({
        id: m.idempotencyKey, tipo: m.tipo, fecha, hora,
        cuerpo: cuerpoMarcar({ ...base, diferida: true }),
      });
    } catch { guardada = false; }
    terminarMarcacion();
    if (!guardada) {
      return mostrarResultado(null, { error: 'No hay señal y no se pudo guardar la marcación en el celular. Escríbele a Tatiana por WhatsApp hoy con la hora.' });
    }
    procesarCola();
    return mostrarResultado(null, { guardada: true, hora });
  }
  if (esDispositivoInvalido(r)) {
    terminarMarcacion();
    soltarToken();
    return pantallaCedula(`${r.mensaje} Después de vincularlo, vuelve a marcar.`);
  }
  if (r.codigo === 'selfie_requerida') {
    aviso($('#camara-aviso'), r.mensaje, 'error');
    $('#btn-otra').click();
    return;
  }
  terminarMarcacion();
  return mostrarResultado(null, { error: r.mensaje });
});

// ------------------------------------------------------------ resultado
function mostrarResultado(datos, opciones = {}) {
  const caja = $('#resultado-caja');
  const motivos = vaciar($('#resultado-motivos'));
  if (datos) {
    const revision = datos.estado === 'revision';
    caja.className = `confirmacion ${revision ? 'aviso-alerta' : 'aviso-ok'}`;
    $('#resultado-titulo').textContent = `${ETIQUETAS[datos.tipo] || 'Marcación'} registrada`;
    $('#resultado-hora').textContent = datos.hora || '';
    $('#resultado-detalle').textContent = [
      datos.ubicacion ? `En ${datos.ubicacion}.` : '',
      revision ? 'Quedó en revisión: Tatiana la revisa. No tienes que hacer nada más.' : 'Te llega el comprobante por WhatsApp.',
    ].filter(Boolean).join(' ');
    if (revision && Array.isArray(datos.motivos)) {
      for (const c of datos.motivos) motivos.append(el('li', { text: textoMotivo(c) }));
    }
  } else if (opciones.guardada) {
    caja.className = 'confirmacion aviso-alerta';
    $('#resultado-titulo').textContent = 'Guardada en tu celular';
    $('#resultado-hora').textContent = opciones.hora;
    $('#resultado-detalle').textContent = persistente
      ? 'No hay señal. Tu marcación se enviará sola cuando haya señal. Abre esta página otra vez cuando tengas conexión.'
      : 'No hay señal. Tu marcación se enviará cuando haya señal, pero no cierres esta página hasta que se envíe.';
  } else {
    caja.className = 'confirmacion aviso-error';
    $('#resultado-titulo').textContent = 'No se pudo marcar';
    $('#resultado-hora').textContent = '';
    $('#resultado-detalle').textContent = opciones.error || 'Intenta otra vez.';
  }
  mostrarPantalla('resultado');
}

$('#btn-listo').addEventListener('click', () => iniciar());

arrancar();
