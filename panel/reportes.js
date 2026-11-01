// Pestaña Reportes por aprobar: reportes_horas_vigentes en 'propuesto' -> aprobar_reportes_horas.
import { el, vaciar, aviso } from '../lib/dom.js';
import { puede } from '../lib/permisos.js';
import { textoLimpio } from '../lib/validacion.js';
import { nombreEmpleado, mostrarError, nodoAviso, tabla, conBoton } from './comun.js';

const FUENTE = { lider: 'Líder de campo', jefe: 'Jefe', whatsapp: 'WhatsApp', ocr: 'Foto del cuaderno', panel: 'Panel', marcacion: 'Marcación' };

export async function montar(ctx, cont) {
  const btn = el('button', { type: 'button', text: 'Actualizar' });
  const av = nodoAviso();
  const resultado = el('div');
  vaciar(cont).append(el('h2', { text: 'Reportes de horas por aprobar' }), btn, av, resultado);
  const cargar = () => conBoton(btn, () => pintar(ctx, resultado, av));
  btn.addEventListener('click', cargar);
  await cargar();
}

const h = (n) => (Number(n) ? String(Number(n)) : '');

async function pintar(ctx, cont, av) {
  vaciar(cont);
  const { data, error } = await ctx.sb.from('reportes_horas_vigentes')
    .select('id, empleado_id, fecha, dia_trabajado, hora_entrada, hora_salida, horas_extra_diurnas, horas_extra_nocturnas, horas_extra_festivas, horas_extra_sabado, horas_extra_dom_fest, festivo_trabajado, fuente, motivo, reemplaza_a, created_at')
    .eq('estado', 'propuesto').order('fecha').order('created_at').limit(500);
  if (error) return mostrarError(av, error);
  if (!data.length) return aviso(av, 'No hay reportes por aprobar.', 'ok');
  av.hidden = true;

  const aprueba = puede(ctx.rol, 'aprobar_reportes');
  const checks = [];
  const todos = el('input', { type: 'checkbox', 'aria-label': 'Seleccionar todos' });
  todos.addEventListener('change', () => { for (const c of checks) c.checked = todos.checked; });
  const filas = data.map((r) => {
    const c = el('input', { type: 'checkbox', value: r.id, 'aria-label': `Seleccionar ${nombreEmpleado(ctx, r.empleado_id)} ${r.fecha}` });
    checks.push(c);
    return el('tr', {},
      aprueba ? el('td', {}, c) : null,
      el('td', { text: r.fecha }),
      el('td', { text: nombreEmpleado(ctx, r.empleado_id) }),
      el('td', { text: FUENTE[r.fuente] || r.fuente }),
      el('td', { text: r.dia_trabajado ? 'Sí' : 'No' }),
      el('td', { text: r.hora_entrada || r.hora_salida ? `${r.hora_entrada || '—'} a ${r.hora_salida || '—'}` : '' }),
      el('td', { class: 'num', text: h(r.horas_extra_diurnas) }),
      el('td', { class: 'num', text: h(r.horas_extra_nocturnas) }),
      el('td', { class: 'num', text: h(r.horas_extra_festivas) }),
      el('td', { class: 'num', text: h(r.horas_extra_sabado) }),
      el('td', { class: 'num', text: h(r.horas_extra_dom_fest) }),
      el('td', { text: r.festivo_trabajado ? 'Sí' : '' }),
      el('td', { text: r.reemplaza_a ? `Corrección: ${r.motivo || ''}` : '' }));
  });
  const enc = ['Fecha', 'Persona', 'Fuente', 'Trabajó', 'Horario',
    { text: 'Extra diurnas', class: 'num' }, { text: 'Extra nocturnas', class: 'num' }, { text: 'Extra festivas', class: 'num' },
    { text: 'Extra sábado', class: 'num' }, { text: 'Extra dom./fest.', class: 'num' }, 'Festivo', 'Nota'];
  const t = tabla(aprueba ? [''].concat(enc) : enc, filas);
  if (aprueba) t.querySelector('thead th').append(todos);
  cont.append(el('p', { text: `${data.length} reportes propuestos.` }), t);

  if (!aprueba) return;
  const motivo = el('textarea', { id: 'reportes-motivo', maxlength: 300 });
  const b = el('button', { type: 'button', class: 'primario', text: 'Aprobar seleccionados' });
  const avB = nodoAviso();
  b.addEventListener('click', () => conBoton(b, async () => {
    const ids = checks.filter((c) => c.checked).map((c) => c.value);
    if (!ids.length) return aviso(avB, 'Selecciona al menos un reporte.', 'alerta');
    const m = textoLimpio(motivo.value);
    const { data: n, error: e } = await ctx.sb.rpc('aprobar_reportes_horas', { p_ids: ids, p_motivo: m || null });
    if (e) return mostrarError(avB, e);
    await pintar(ctx, cont, av);
    aviso(av, `Aprobaste ${n} ${n === 1 ? 'reporte' : 'reportes'}.`, 'ok');
  }));
  cont.append(el('label', { for: 'reportes-motivo', text: 'Comentario (opcional)' }), motivo, b, avB);
}
