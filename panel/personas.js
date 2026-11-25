// Pestaña Personas: Tatiana agrega, corrige y retira personas sin pasar por el importador.
// La base valida todo de nuevo en guardar_empleado() (solo operaciones) y deja bitácora.
// La cédula y el WhatsApp no se muestran en la lista: se ven con "Ver cédula y WhatsApp",
// que usa consultar_identidad() y también deja bitácora.
import { el, vaciar, aviso } from '../lib/dom.js';
import { validarPersona } from '../lib/personas.js';
import { validarEsporadica, filasDias, motivoDias, CARGO_ESPORADICA } from '../lib/esporadicas.js';
import { fechaBogota } from '../lib/fechas.js';
import { nuevoId } from '../lib/ids.js';
import { puede } from '../lib/permisos.js';
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
  const esporadica = el('button', { type: 'button', class: 'primario', text: 'Agregar esporádica' });
  esporadica.hidden = !puedeEditar;
  const registraDias = puede(ctx.rol, 'captura_degradada');
  cont.append(el('div', { class: 'botones' }, esporadica, nueva), el('div', { class: 'fila-check' }, verRetiradas, el('label', { for: verRetiradas.id, text: 'Ver también las retiradas' })), av, formulario, lista);

  const { data: regimenes, error: er } = await ctx.sb.from('regimenes').select('id, codigo, nombre').order('nombre');
  if (er) return mostrarError(av, er);

  const pintarLista = async () => {
    const { data, error } = await ctx.sb.from('empleados').select(CAMPOS).order('nombre_completo');
    if (error) return mostrarError(av, error);
    const filas = data.filter((e) => verRetiradas.checked || e.activo);
    const regimen = (id) => regimenes.find((r) => r.id === id)?.nombre ?? '—';
    const botonDias = (e) => {
      if (!registraDias || !e.activo || e.cargo !== CARGO_ESPORADICA) return null;
      const d = el('button', { type: 'button', text: 'Días' });
      d.addEventListener('click', () => pintarDias(e));
      return d;
    };
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
          el('td', {}, b, ' ', botonDias(e)));
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

  // Filas de días (fecha, entrada, salida) con "Agregar otro día". Devuelve el nodo y cómo leerlas.
  const tablaDias = (prefijo) => {
    const filas = [];
    const cuerpo = el('div');
    const agregar = () => {
      const i = filas.length;
      const f = {
        fecha: el('input', { type: 'date', max: fechaBogota(), 'aria-label': `Día ${i + 1}: fecha`, id: `${prefijo}-f${i}` }),
        entrada: el('input', { type: 'time', 'aria-label': `Día ${i + 1}: entrada` }),
        salida: el('input', { type: 'time', 'aria-label': `Día ${i + 1}: salida` }),
      };
      filas.push(f);
      cuerpo.append(el('div', { class: 'botones' }, el('span', { text: `Día ${i + 1}` }), f.fecha,
        el('span', { text: 'entró' }), f.entrada, el('span', { text: 'salió' }), f.salida));
    };
    for (let i = 0; i < 3; i++) agregar();
    const mas = el('button', { type: 'button', text: 'Agregar otro día' });
    mas.addEventListener('click', agregar);
    const leer = () => filas.map((f) => ({ fecha: f.fecha.value, entrada: f.entrada.value, salida: f.salida.value }));
    return { nodo: el('div', {}, cuerpo, mas), leer };
  };

  const guardarDias = async (empleado, ubicacionId, dias, avf) => {
    const r = filasDias(dias, { empleadoId: empleado.id, ubicacionId, uid: ctx.uid, motivo: motivoDias(ctx.nombre), hoy: fechaBogota(), nuevoId });
    if (r.errores.length) { aviso(avf, r.errores.join(' '), 'error'); return false; }
    const { error } = await ctx.sb.from('marcaciones').insert(r.filas);
    if (error) { mostrarError(avf, error); return false; }
    return r.filas.length / 2;
  };

  // Alta rápida de esporádica: lo mínimo, y de una vez sus días trabajados.
  const pintarEsporadica = () => {
    const jornal = regimenes.find((r) => r.codigo === 'jornal')?.id ?? null;
    const id = (n) => `esp-${n}`;
    const campo = (nombre, nodo, ayuda) => el('div', {}, el('label', { for: nodo.id, text: nombre }), nodo, ayuda ? el('p', { class: 'suave', text: ayuda }) : null);
    const nombre = el('input', { id: id('nombre'), autocomplete: 'off' });
    const cedula = el('input', { id: id('cedula'), inputmode: 'numeric', autocomplete: 'off' });
    const whatsapp = el('input', { id: id('whatsapp'), inputmode: 'tel', autocomplete: 'off' });
    const punto = el('select', { id: id('punto') }, el('option', { value: '', text: 'Elige' }),
      Array.from(ctx.ubicaciones.values()).filter((u) => u.activa && u.tipo === 'fija').map((u) => el('option', { value: u.id, text: u.nombre })));
    const medio = el('select', { id: id('medio') },
      el('option', { value: 'efectivo', text: 'Efectivo' }), el('option', { value: 'banco', text: 'Banco' }));
    const dias = tablaDias('esp');
    const avf = nodoAviso();
    const guardar = el('button', { type: 'button', class: 'primario', text: 'Guardar esporádica y sus días' });
    const cerrar = el('button', { type: 'button', text: 'Cerrar' });
    cerrar.addEventListener('click', () => vaciar(formulario));
    guardar.addEventListener('click', () => conBoton(guardar, async () => {
      const leidos = dias.leer();
      const primer = leidos.map((d) => d.fecha).filter(Boolean).sort()[0];
      const r = validarEsporadica({ nombre_completo: nombre.value, cedula: cedula.value, whatsapp: whatsapp.value,
        ubicacion_base_id: punto.value, medio_pago: medio.value, primer_dia: primer }, jornal, fechaBogota());
      if (r.errores.length) return aviso(avf, r.errores.join(' '), 'error');
      // Antes de crear a la persona se revisan los días, para no dejarla a medias.
      const prueba = filasDias(leidos, { empleadoId: 'x', ubicacionId: punto.value, uid: ctx.uid, motivo: 'x', hoy: fechaBogota(), nuevoId });
      if (prueba.errores.length) return aviso(avf, prueba.errores.join(' '), 'error');
      const { data: nuevoIdEmp, error } = await ctx.sb.rpc('guardar_empleado', { p_id: null, p_datos: r.datos, p_cedula: r.cedula, p_whatsapp: r.whatsapp });
      if (error) return mostrarError(avf, error);
      await cargarMaestros(ctx);
      const n = await guardarDias({ id: nuevoIdEmp }, punto.value, leidos, avf);
      if (n === false) {
        aviso(av, `${r.datos.nombre_completo} quedó creada, pero sus días no se guardaron. Búscala en la lista y usa "Días".`, 'error');
      } else {
        vaciar(formulario);
        aviso(av, `Listo: ${r.datos.nombre_completo} con ${n} día(s). Entra en la quincena como persona por días.`
          + (r.datos.medio_pago === 'banco' ? ' Antes de pagarle por banco hay que registrar y verificar su cuenta.' : ''), 'ok');
      }
      await pintarLista();
    }));
    vaciar(formulario).append(el('div', { class: 'tarjeta' },
      el('h3', { text: 'Agregar esporádica' }),
      el('p', { class: 'suave', text: 'Para quien viene uno o pocos días y no marca con QR. Queda como persona por días (Jornal 8 h); el sistema le calcula el día y las extras.' }),
      campo('Nombre completo, con apellidos', nombre),
      campo('Cédula', cedula),
      campo('WhatsApp', whatsapp, '10 números, empieza por 3.'),
      campo('Punto donde trabajó', punto),
      campo('Medio de pago', medio, 'Si es por banco, la cuenta se verifica aparte antes de pagar.'),
      el('h3', { text: 'Días trabajados' }),
      el('p', { class: 'suave', text: 'Fecha, hora de entrada y hora de salida de cada día. Las filas vacías no se tienen en cuenta.' }),
      dias.nodo,
      el('div', { class: 'botones' }, guardar, cerrar),
      avf));
    formulario.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  // Más días para una esporádica que ya existe.
  const pintarDias = (e) => {
    const dias = tablaDias('dias');
    const avf = nodoAviso();
    const guardar = el('button', { type: 'button', class: 'primario', text: 'Guardar días' });
    const cerrar = el('button', { type: 'button', text: 'Cerrar' });
    cerrar.addEventListener('click', () => vaciar(formulario));
    guardar.addEventListener('click', () => conBoton(guardar, async () => {
      const n = await guardarDias(e, e.ubicacion_base_id, dias.leer(), avf);
      if (n === false) return;
      vaciar(formulario);
      aviso(av, `Guardados ${n} día(s) de ${e.nombre_completo}.`, 'ok');
    }));
    vaciar(formulario).append(el('div', { class: 'tarjeta' },
      el('h3', { text: `Días de ${e.nombre_completo}` }),
      el('p', { class: 'suave', text: `Punto: ${nombreUbicacion(ctx, e.ubicacion_base_id)}. Para corregir un día ya guardado usa Por fechas → Marcas.` }),
      dias.nodo,
      el('div', { class: 'botones' }, guardar, cerrar),
      avf));
    formulario.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  };

  esporadica.addEventListener('click', pintarEsporadica);
  nueva.addEventListener('click', () => pintarFormulario(null));
  verRetiradas.addEventListener('change', pintarLista);
  await pintarLista();
}
