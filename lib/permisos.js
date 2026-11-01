// Qué botones ve cada rol en el panel. La base (RLS y funciones) es la que manda:
// esto solo evita mostrar acciones que de todas formas fallarían.

const ACCIONES = {
  resolver_alerta: ['operaciones', 'pagos'],
  aprobar_reportes: ['operaciones'],
  aprobar_prenomina: ['operaciones'],
  confirmar_total_hash: ['operaciones', 'contador'],
  segunda_aprobacion: ['pagos'],
  marcar_descargado: ['pagos'],
  marcar_subido: ['pagos'],
  confirmar_pago_banco: ['pagos', 'operaciones'],
  resolver_hallazgo: ['operaciones', 'pagos', 'contador'],
  confirmar_planilla: ['operaciones', 'contador'],
  registrar_entrega: ['pagos'],
  cruzar_planilla: ['operaciones', 'contador'],
  captura_degradada: ['operaciones', 'pagos'],
  ver_selfie: ['operaciones', 'pagos'],
};

export const ROLES_PANEL = ['operaciones', 'pagos', 'contador', 'admin'];

export function puede(rol, accion) {
  return Boolean(ACCIONES[accion] && ACCIONES[accion].includes(rol));
}

// Acciones disponibles sobre un lote de pago según su estado y el rol.
export function accionesArchivo(rol, a, usuarioId) {
  const r = [];
  if (!a) return r;
  if (['generado', 'descargado'].includes(a.estado) && !a.confirmado_por && puede(rol, 'confirmar_total_hash')) {
    r.push('confirmar_total_hash');
  }
  if (a.confirmado_por && a.segunda_aprobacion_requerida && !a.segunda_aprobacion_por
      && a.confirmado_por !== usuarioId && puede(rol, 'segunda_aprobacion')) {
    r.push('segunda_aprobacion');
  }
  if (a.estado === 'generado' && puede(rol, 'marcar_descargado')) r.push('marcar_descargado');
  if (a.estado === 'descargado' && puede(rol, 'marcar_subido')) r.push('marcar_subido');
  if (a.estado === 'subido' && puede(rol, 'confirmar_pago_banco')) r.push('confirmar_pago_banco');
  return r;
}

// Acciones sobre una planilla de efectivo según su estado y el rol.
export function accionesPlanilla(rol, p, usuarioId) {
  const r = [];
  if (!p) return r;
  if (p.estado === 'generada' && puede(rol, 'confirmar_planilla')) r.push('confirmar_planilla');
  if (p.estado === 'confirmada' && puede(rol, 'registrar_entrega')) r.push('registrar_entrega');
  if (p.estado === 'entregada' && p.entregada_por !== usuarioId && puede(rol, 'cruzar_planilla')) r.push('cruzar_planilla');
  if (['confirmada', 'entregada'].includes(p.estado)) r.push('imprimir');
  return r;
}

// Último resultado por auditor (la tabla es de solo inserción; manda la secuencia mayor).
export function ultimosPorAuditor(auditorias) {
  const m = new Map();
  for (const a of auditorias) {
    const prev = m.get(a.auditor);
    if (!prev || Number(a.secuencia) > Number(prev.secuencia)) m.set(a.auditor, a);
  }
  return ['H1', 'H2', 'H3', 'H4', 'A', 'B'].filter((k) => m.has(k)).map((k) => m.get(k));
}

// Hallazgos que aún piden comentario (amarillo, no 'info', sin resolución).
export function hallazgosPendientes(auditoria, resueltos) {
  if (!auditoria || auditoria.resultado !== 'amarillo') return [];
  const hechos = new Set(resueltos.filter((r) => r.auditoria_id === auditoria.id).map((r) => r.hallazgo_codigo));
  return (Array.isArray(auditoria.hallazgos) ? auditoria.hallazgos : [])
    .filter((h) => (h.severidad || 'amarillo') !== 'info' && !hechos.has(h.codigo));
}
