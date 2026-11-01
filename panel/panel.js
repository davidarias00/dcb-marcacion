// Panel de Tatiana (operaciones) y David (pagos). La base decide qué puede cada rol;
// el panel solo esconde los botones que no aplican.
import { configLista } from '../config.js';
import { crearSupabase, perfilActual } from '../lib/supabase.js';
import { $, $$, mostrarPantalla, aviso } from '../lib/dom.js';
import { ROLES_PANEL } from '../lib/permisos.js';
import { cargarMaestros } from './comun.js';
import * as hoy from './hoy.js';
import * as alertas from './alertas.js';
import * as reportes from './reportes.js';
import * as quincena from './quincena.js';
import * as efectivo from './efectivo.js';
import * as captura from './captura.js';

const PESTANAS = { hoy, alertas, reportes, quincena, efectivo, captura };
const NOMBRE_ROL = { operaciones: 'Operaciones', pagos: 'Pagos', contador: 'Contador', admin: 'Administración' };

const ctx = { sb: null, uid: null, rol: null, nombre: '', empleados: new Map(), ubicaciones: new Map() };

function error(texto) {
  $('#error-texto').textContent = texto;
  mostrarPantalla('error');
}

async function arrancar() {
  if (!configLista()) return error('El portal todavía no está configurado (config.js).');
  try { ctx.sb = crearSupabase(); } catch { return error('No se pudo cargar supabase-js. Revisa la conexión.'); }
  const { data } = await ctx.sb.auth.getSession();
  if (!data.session) return mostrarPantalla('login');
  await entrar(data.session.user.id);
}

$('#form-login').addEventListener('submit', async (ev) => {
  ev.preventDefault();
  const av = $('#login-aviso');
  const b = $('#btn-login');
  b.disabled = true;
  aviso(av, 'Entrando…', 'info');
  const { data, error: e } = await ctx.sb.auth.signInWithPassword({
    email: $('#correo').value.trim(), password: $('#clave').value,
  });
  b.disabled = false;
  $('#clave').value = '';
  if (e) return aviso(av, 'No pudiste entrar. Revisa el correo y la contraseña.', 'error');
  aviso(av, '', 'info');
  await entrar(data.user.id);
});

async function salir() {
  await ctx.sb.auth.signOut().catch(() => {});
  location.reload();
}
$('#btn-salir').addEventListener('click', salir);
$('#btn-salir-error').addEventListener('click', salir);

async function entrar(uid) {
  mostrarPantalla('cargando');
  try {
    const perfil = await perfilActual(ctx.sb, uid);
    if (!perfil || !perfil.activo || !ROLES_PANEL.includes(perfil.rol)) {
      return error('Tu usuario no tiene acceso al panel.');
    }
    ctx.uid = uid;
    ctx.rol = perfil.rol;
    ctx.nombre = perfil.nombre;
    await cargarMaestros(ctx);
  } catch (e) {
    return error(e && e.message ? e.message : 'No se pudo cargar el panel.');
  }
  $('#quien').textContent = `${ctx.nombre} · ${NOMBRE_ROL[ctx.rol] || ctx.rol}`;
  mostrarPantalla('panel');
  abrir(leerPestana());
}

function leerPestana() {
  const h = location.hash.replace('#', '');
  return PESTANAS[h] ? h : 'hoy';
}

const cargadas = new Set();
async function abrir(nombre) {
  for (const b of $$('nav.pestanas button')) b.setAttribute('aria-selected', String(b.dataset.tab === nombre));
  for (const p of $$('[data-tabpanel]')) p.hidden = p.dataset.tabpanel !== nombre;
  if (location.hash !== `#${nombre}`) history.replaceState(null, '', `#${nombre}`);
  const cont = $(`[data-tabpanel="${nombre}"]`);
  if (!cargadas.has(nombre)) {
    cargadas.add(nombre);
    try {
      await PESTANAS[nombre].montar(ctx, cont);
    } catch (e) {
      cargadas.delete(nombre);
      cont.textContent = e && e.message ? e.message : 'No se pudo cargar esta sección.';
    }
  }
}

$('nav.pestanas').addEventListener('click', (ev) => {
  const b = ev.target.closest('button[data-tab]');
  if (b) abrir(b.dataset.tab);
});

arrancar();
