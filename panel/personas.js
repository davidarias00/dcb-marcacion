// Pestaña Personas: Tatiana agrega, corrige y retira personas sin pasar por el importador.
// La base valida todo de nuevo en guardar_empleado() (solo operaciones) y deja bitácora.
// La cédula y el WhatsApp no se muestran en la lista: se ven con "Ver cédula y WhatsApp",
// que usa consultar_identidad() y también deja bitácora.
import { el, vaciar, aviso } from '../lib/dom.js';
import { validarPersona } from '../lib/personas.js';
import { cargarMaestros, nombreUbicacion, mostrarError, nodoAviso, chip, tabla, conBoton } from './comun.js';

const CAMPOS = 'id, nombre_completo, frente, grupo, regimen_id, ubicacion_base_id, marca_en_cualquier_punto, paga_begranda, medio_pago, cargo, fecha_ingreso, fecha_retiro, activo';
const FRENTES = { A: 'A · Vinculado (Begranda)', B: 'B · Por días', C: 'C · Campo o aseo' };

export async function montar(ctx, cont) {
  vaciar(cont).append(el('h2', { text: 'Personas' }));
  const puedeEditar = ctx.rol === 'operaciones';
  if (!puedeEditar) cont.append(el('p', { class: 'aviso aviso-info', text: 'Solo operaciones agrega o cambia personas.' }));
  const av = nodoAviso();
  const formulario = el('div');
  const lista = el('div');
  const verRetiradas = el('input', { type: 'checkbox', id: 'per-retiradas' });
  const nueva = el('button', { type: 'button', class: 'primario', text: 'Agregar persona' });
  nueva.hidden = !puedeEditar;
  cont.append(nueva, el('div', { class: 'fila-check' }, verRetiradas, el('label', { for: verRetiradas.id, text: 'Ver también las retiradas' })), av, formulario, lista);

  const { data: regimenes, error: er } = await ctx.sb.from('regimenes').select('id, codigo, nombre').order('nombre');
  if (er) return mostrarError(av, er);

  const pintarLista = async () => {
    const { data, error } = await ctx.sb.from('empleados').select(CAMPOS).order('nombre_completo');
    if (error) return mostrarError(av, error);
    const filas = data.filter((e) => verRetiradas.checked || e.activo);
    const regimen = (id) => regimenes.find((r) => r.id === id)?.nombre ?? '—';
    vaciar(lista).append(
      el('p', { class: 'suave', text: `${data.filter((e) => e.activo).length} personas activas.` }),
      tabla(['Persona', 'Frente', 'Régimen', 'Punto base', 'Estado', ''], filas.map((e) => {
        const b = el('button', { type: 'button', text: puedeEditar ? 'Editar' : 'Ver' });
        b.addEventListener('click', () => pintarFormulario(e));
        return el('tr', {},
          el('td', { text: e.nombre_completo }),
          el('td', { text: e.frente === 'C' ? `C · ${e.grupo}` : e.frente }),
          el('td', { text: regimen(e.regimen_id) }),
          el('td', { text: e.marca_en_cualquier_punto ? `${nombreUbicacion(ctx, e.ubicacion_base_id)} (cualquier punto)` : nombreUbicacion(ctx, e.ubicacion_base_id) }),
          el('td', {}, e.activo ? chip('Activa', 'verde') : chip(`Retirada ${e.fecha_retiro ?? ''}`, null)),
          el('td', {}, b));
      })));
  };

  const pintarFormulario = (e) => {
    const esNueva = !e;
    const p = e ?? { frente: 'B', activo: true, medio_pago: 'banco' };
    const id = (n) => `per-${n}`;
    const campo = (nombre, nodo, ayuda) => el('div', {}, el('label', { for: nodo.id, text: nombre }), nodo, ayuda ? el('p', { class: 'suave', text: ayuda }) : null);
    const nombre = el('input', { id: id('nombre'), value: p.nombre_completo ?? '', autocomplete: 'off' });
    const frente = el('select', { id: id('frente') }, Object.entries(FRENTES).map(([v, t]) => el('option', { value: v, text: t, selected: p.frente === v })));
    const grupo = el('select', { id: id('grupo') }, el('option', { value: '', text: 'Elige' }),
      ['campo', 'aseo'].map((g) => el('option', { value: g, text: g === 'campo' ? 'Campo' : 'Aseo', selected: p.grupo === g })));
    const regimen = el('select', { id: id('regimen') }, el('option', { value: '', text: 'Elige' }),
      regimenes.map((r) => el('option', { value: r.id, text: r.nombre, selected: p.regimen_id === r.id })));
    const punto = el('select', { id: id('punto') }, el('option', { value: '', text: 'Elige' }),
      Array.from(ctx.ubicaciones.values()).filter((u) => u.activa).map((u) => el('option', { value: u.id, text: u.nombre, selected: p.ubicacion_base_id === u.id })));
    const cualquier = el('input', { type: 'checkbox', id: id('cualquier'), checked: Boolean(p.marca_en_cualquier_punto) });
    const begranda = el('input', { type: 'checkbox', id: id('begranda'), checked: Boolean(p.paga_begranda) });
    const medio = el('select', { id: id('medio') }, ['banco', 'efectivo'].map((m) => el('option', { value: m, text: m === 'banco' ? 'Banco' : 'Efectivo', selected: p.medio_pago === m })));
    const cargo = el('input', { id: id('cargo'), value: p.cargo ?? '' });
    const ingreso = el('input', { id: id('ingreso'), type: 'date', value: p.fecha_ingreso ?? '' });
    const activo = el('input', { type: 'checkbox', id: id('activo'), checked: p.activo !== false });
    const retiro = el('input', { id: id('retiro'), type: 'date', value: p.fecha_retiro ?? '' });
    const cedula = el('input', { id: id('cedula'), inputmode: 'numeric', autocomplete: 'off' });
    const whatsapp = el('input', { id: id('whatsapp'), inputmode: 'tel', autocomplete: 'off' });
    const avf = nodoAviso();
    const ver = el('button', { type: 'button', text: 'Ver cédula y WhatsApp' });
    ver.hidden = esNueva;
    ver.addEventListener('click', () => conBoton(ver, async () => {
      const { data, error } = await ctx.sb.rpc('consultar_identidad', { p_empleado_id: p.id });
      if (error) return mostrarError(avf, error);
      const i = data?.[0];
      aviso(avf, i ? `Cédula ${i.cedula} · WhatsApp ${i.whatsapp}` : 'Esta persona no tiene cédula ni WhatsApp cargados.', 'info');
    }));
    const ajustar = () => { grupo.parentElement.hidden = frente.value !== 'C'; retiro.parentElement.hidden = activo.checked; };
    frente.addEventListener('change', ajustar);
    activo.addEventListener('change', ajustar);

    const guardar = el('button', { type: 'button', class: 'primario', text: esNueva ? 'Agregar' : 'Guardar cambios' });
    const cancelar = el('button', { type: 'button', text: 'Cerrar' });
    cancelar.addEventListener('click', () => vaciar(formulario));
    guardar.hidden = !puedeEditar;
    guardar.addEventListener('click', () => conBoton(guardar, async () => {
      const r = validarPersona({
        nombre_completo: nombre.value, frente: frente.value, grupo: grupo.value, regimen_id: regimen.value,
        ubicacion_base_id: punto.value, marca_en_cualquier_punto: cualquier.checked, paga_begranda: begranda.checked,
        medio_pago: medio.value, cargo: cargo.value, fecha_ingreso: ingreso.value, activo: activo.checked,
        fecha_retiro: retiro.value, cedula: cedula.value, whatsapp: whatsapp.value,
      }, esNueva);
      if (r.errores.length) return aviso(avf, r.errores.join(' '), 'error');
      const { error } = await ctx.sb.rpc('guardar_empleado', { p_id: p.id ?? null, p_datos: r.datos, p_cedula: r.cedula, p_whatsapp: r.whatsapp });
      if (error) return mostrarError(avf, error);
      await cargarMaestros(ctx);
      vaciar(formulario);
      aviso(av, esNueva ? `Agregada: ${r.datos.nombre_completo}. Ya le puedes generar el código en Vincular celulares.` : `Guardado: ${r.datos.nombre_completo}.`, 'ok');
      await pintarLista();
    }));

    vaciar(formulario).append(el('div', { class: 'tarjeta' },
      el('h3', { text: esNueva ? 'Agregar persona' : p.nombre_completo }),
      campo('Nombre completo, con apellidos', nombre),
      campo('Frente', frente),
      campo('Campo o aseo', grupo),
      campo('Régimen', regimen, 'Define la jornada y desde dónde se cuentan las horas extra.'),
      campo('Punto base', punto),
      el('div', { class: 'fila-check' }, cualquier, el('label', { for: cualquier.id, text: 'Puede marcar en cualquier punto (cubre descansos)' })),
      el('div', { class: 'fila-check' }, begranda, el('label', { for: begranda.id, text: 'Se le paga por Begranda' })),
      campo('Medio de pago', medio),
      campo('Cargo (opcional)', cargo),
      campo('Fecha de ingreso (opcional)', ingreso),
      campo(esNueva ? 'Cédula' : 'Cédula nueva (solo si cambia)', cedula),
      campo(esNueva ? 'WhatsApp' : 'WhatsApp nuevo (solo si cambia)', whatsapp, '10 números, empieza por 3.'),
      el('div', { class: 'fila-check' }, activo, el('label', { for: activo.id, text: 'Activa' })),
      campo('Fecha de retiro', retiro),
      el('div', { class: 'botones' }, guardar, ver, cancelar),
      avf));
    for (const n of [nombre, frente, grupo, regimen, punto, cualquier, begranda, medio, cargo, ingreso, cedula, whatsapp, activo, retiro]) n.disabled = !puedeEditar;
    ajustar();
    formulario.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  nueva.addEventListener('click', () => pintarFormulario(null));
  verRetiradas.addEventListener('change', pintarLista);
  await pintarLista();
}
