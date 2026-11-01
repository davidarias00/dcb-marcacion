// Pestaña Vincular celulares (piloto): Tatiana genera el código de 6 números de una persona y se lo
// da para que vincule su celular la primera vez. Dura 30 minutos y sirve una sola vez.
import { el, vaciar, aviso } from '../lib/dom.js';
import { nodoAviso, conBoton } from './comun.js';

export async function montar(ctx, cont) {
  vaciar(cont).append(el('h2', { text: 'Vincular celulares' }));
  if (ctx.rol !== 'operaciones') {
    cont.append(el('p', { class: 'aviso aviso-info', text: 'Solo operaciones genera códigos de vinculación.' }));
    return;
  }
  cont.append(el('p', { class: 'suave', text: 'La persona abre el QR, escribe su cédula y luego este código. Dura 30 minutos y sirve una sola vez. Dáselo en persona o por WhatsApp directo a ella.' }));
  const persona = el('select', { id: 'cod-persona', required: true },
    el('option', { value: '', text: 'Elige la persona' }),
    Array.from(ctx.empleados.values()).filter((e) => e.activo).map((e) => el('option', { value: e.id, text: e.nombre_completo })));
  const av = nodoAviso();
  const resultado = el('p', { class: 'confirmacion', hidden: true });
  const b = el('button', { type: 'button', class: 'primario', text: 'Generar código' });
  b.addEventListener('click', () => conBoton(b, async () => {
    resultado.hidden = true;
    if (!persona.value) return aviso(av, 'Elige la persona.', 'error');
    const { data, error } = await ctx.sb.rpc('generar_codigo_vinculacion', { p_empleado_id: persona.value });
    if (error) return aviso(av, error.message, 'error');
    aviso(av, '', 'info');
    vaciar(resultado).append(
      el('span', { class: 'titulo', text: ctx.empleados.get(persona.value).nombre_completo }),
      el('span', { class: 'hora', text: data }),
      el('span', { class: 'suave', text: 'Vence en 30 minutos.' }));
    resultado.hidden = false;
  }));
  cont.append(el('label', { for: 'cod-persona', text: 'Persona' }), persona, b, av, resultado);
}
