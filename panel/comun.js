// Utilidades compartidas por las pestañas del panel.
import { el, aviso } from '../lib/dom.js';
import { horaBogota, fechaBogota } from '../lib/fechas.js';

// Maestros que usan varias pestañas (RLS ya filtra lo que cada rol ve).
export async function cargarMaestros(ctx) {
  const [emp, ubi] = await Promise.all([
    ctx.sb.from('empleados').select('id, nombre_completo, frente, grupo, ubicacion_base_id, activo, medio_pago').order('nombre_completo'),
    ctx.sb.from('ubicaciones').select('id, nombre, tipo, activa, permite_marcar').order('nombre'),
  ]);
  if (emp.error) throw emp.error;
  if (ubi.error) throw ubi.error;
  ctx.empleados = new Map(emp.data.map((e) => [e.id, e]));
  ctx.ubicaciones = new Map(ubi.data.map((u) => [u.id, u]));
}

export function nombreEmpleado(ctx, id) {
  const e = ctx.empleados.get(id);
  return e ? e.nombre_completo : '(persona no visible)';
}

export function nombreUbicacion(ctx, id) {
  const u = ctx.ubicaciones.get(id);
  return u ? u.nombre : '—';
}

// Fecha y hora corta en Bogotá: '2026-11-02 06:01'.
export function fechaHora(ts) {
  if (!ts) return '—';
  const d = new Date(ts);
  return `${fechaBogota(d)} ${horaBogota(d)}`;
}

// Muestra el error tal cual viene (los mensajes de las funciones están en español).
export function mostrarError(nodo, error) {
  const m = error && (error.message || error.error_description || String(error));
  aviso(nodo, m || 'Ocurrió un error.', 'error');
}

// Ejecuta fn con el botón deshabilitado (evita doble clic).
export async function conBoton(boton, fn) {
  if (boton.disabled) return undefined;
  boton.disabled = true;
  try {
    return await fn();
  } finally {
    boton.disabled = false;
  }
}

export function chip(texto, color) {
  return el('span', { class: `chip${color ? ` chip-${color}` : ''}`, text: texto });
}

export function nodoAviso() {
  return el('p', { class: 'aviso', hidden: true, role: 'status', 'aria-live': 'polite' });
}

export function tabla(encabezados, filas) {
  const thead = el('thead', {}, el('tr', {}, encabezados.map((h) =>
    (typeof h === 'string' ? el('th', { scope: 'col', text: h }) : el('th', { scope: 'col', class: h.class, text: h.text })))));
  const tbody = el('tbody', {}, filas);
  return el('div', { class: 'tabla-caja' }, el('table', {}, thead, tbody));
}

// Selector de periodos (Quincena y Efectivo).
export async function cargarPeriodos(ctx) {
  const { data, error } = await ctx.sb.from('periodos_nomina')
    .select('id, inicio, fin, horas_desde, corte, fecha_pago, fecha_pago_efectivo, estado, version, snapshot_hash')
    .order('inicio', { ascending: false }).limit(24);
  if (error) throw error;
  return data;
}

export function selectorPeriodo(periodos, seleccionado, alCambiar) {
  const s = el('select', { id: `periodo-${Math.random().toString(36).slice(2, 8)}` });
  for (const p of periodos) {
    s.append(el('option', { value: p.id, selected: p.id === seleccionado, text: `${p.inicio} a ${p.fin} · ${p.estado} (v${p.version})` }));
  }
  s.addEventListener('change', () => alCambiar(s.value));
  return el('div', {}, el('label', { for: s.id, text: 'Quincena' }), s);
}
