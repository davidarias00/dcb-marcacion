// Resumen del día para la pestaña Hoy. Lógica pura.

// marcaciones de una persona en el día (cualquier orden) -> horas por tipo y qué falta.
export function estadoPersona(marcaciones) {
  const orden = [...marcaciones].sort((a, b) => Date.parse(a.ts_efectivo) - Date.parse(b.ts_efectivo));
  const r = {
    entrada: null, salida_almuerzo: null, regreso_almuerzo: null, salida: null,
    revision: false, diferida: false, falta: null, total: orden.length,
  };
  for (const m of orden) {
    if (m.tipo === 'entrada') { if (!r.entrada) r.entrada = m.ts_efectivo; }
    else if (m.tipo === 'salida') r.salida = m.ts_efectivo;
    else if (!r[m.tipo]) r[m.tipo] = m.ts_efectivo;
    if (m.estado === 'revision') r.revision = true;
    if (m.diferida) r.diferida = true;
  }
  if (orden.length === 0) r.falta = 'todo';
  else if (!r.entrada) r.falta = 'entrada';
  else if (!r.salida) r.falta = 'salida';
  else if (r.salida_almuerzo && !r.regreso_almuerzo) r.falta = 'regreso_almuerzo';
  return r;
}

// empleados: [{id, nombre_completo, ubicacion_base_id}] activos con ubicación base.
// Devuelve grupos por ubicación base y las personas que marcaron sin estar en la lista.
export function resumenDia(empleados, marcaciones) {
  const porPersona = new Map();
  for (const m of marcaciones) {
    if (!porPersona.has(m.empleado_id)) porPersona.set(m.empleado_id, []);
    porPersona.get(m.empleado_id).push(m);
  }
  const grupos = new Map();
  let marcaron = 0;
  const faltan = [];
  const conocidos = new Set();
  for (const e of empleados) {
    conocidos.add(e.id);
    const est = estadoPersona(porPersona.get(e.id) || []);
    if (est.total > 0) marcaron++; else faltan.push(e);
    if (!grupos.has(e.ubicacion_base_id)) grupos.set(e.ubicacion_base_id, []);
    grupos.get(e.ubicacion_base_id).push({ empleado: e, estado: est });
  }
  const otros = [];
  for (const [id, ms] of porPersona) {
    if (!conocidos.has(id)) otros.push({ empleadoId: id, estado: estadoPersona(ms) });
  }
  return { grupos, marcaron, total: empleados.length, faltan, otros };
}

// Resumen de un rango de días para la pestaña Por fechas. Lógica pura.
// empleados: [{id, nombre_completo, ubicacion_base_id}]; marcaciones vigentes del rango;
// dias: ['YYYY-MM-DD', ...] (Bogotá); fechaDe: ts -> 'YYYY-MM-DD' en Bogotá; hoy: 'YYYY-MM-DD'.
// inicioPorPersona (opcional): Map empleado_id -> 'YYYY-MM-DD' en que vinculó su primer celular.
// Si se pasa, los días sin marcas solo se cuentan desde esa fecha, y quien no está en el mapa
// queda como sinCelular (todavía no puede marcar).
// Un día sin marcas no es necesariamente un olvido (puede ser descanso): se lista para verificar.
export function resumenRango(empleados, marcaciones, dias, fechaDe, hoy, inicioPorPersona = null) {
  const porPersonaDia = new Map();
  for (const m of marcaciones) {
    const clave = `${m.empleado_id}|${fechaDe(m.ts_efectivo)}`;
    if (!porPersonaDia.has(clave)) porPersonaDia.set(clave, []);
    porPersonaDia.get(clave).push(m);
  }
  const transcurridos = dias.filter((d) => d <= hoy);
  const personas = [];
  const detalle = [];
  const conocidos = new Set();
  const fila = (empleadoId) => ({ completos: 0, incompletos: 0, revision: 0, sinMarcas: [], ultima: null, empleadoId });
  for (const e of empleados) {
    conocidos.add(e.id);
    const inicio = inicioPorPersona ? inicioPorPersona.get(e.id) : '';
    const p = { empleado: e, ...fila(e.id), sinCelular: Boolean(inicioPorPersona) && !inicio };
    for (const d of transcurridos) {
      const ms = porPersonaDia.get(`${e.id}|${d}`) || [];
      if (!ms.length) { if (d < hoy && !p.sinCelular && d >= inicio) p.sinMarcas.push(d); continue; }
      const est = estadoPersona(ms);
      // Hoy la jornada puede seguir abierta: no cuenta como incompleta.
      if (!est.falta) p.completos++;
      else if (!(d === hoy && est.falta === 'salida')) p.incompletos++;
      if (est.revision) p.revision++;
      p.ultima = d;
      detalle.push({ fecha: d, empleadoId: e.id, estado: est });
    }
    personas.push(p);
  }
  for (const [clave, ms] of porPersonaDia) {
    const [id, d] = clave.split('|');
    if (!conocidos.has(id)) detalle.push({ fecha: d, empleadoId: id, estado: estadoPersona(ms) });
  }
  detalle.sort((a, b) => (a.fecha === b.fecha ? 0 : a.fecha < b.fecha ? 1 : -1));
  const tot = personas.reduce((t, p) => ({
    completos: t.completos + p.completos, incompletos: t.incompletos + p.incompletos,
    sinMarcas: t.sinMarcas + p.sinMarcas.length,
  }), { completos: 0, incompletos: 0, sinMarcas: 0 });
  return { personas, detalle, ...tot };
}
