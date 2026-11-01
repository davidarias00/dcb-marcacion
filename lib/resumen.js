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
