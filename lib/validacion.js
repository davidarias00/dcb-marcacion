// Validaciones y formatos puros que usan las pantallas de campo y el panel.

export function textoLimpio(t) {
  return String(t ?? '').trim().replace(/\s+/g, ' ');
}

// Motivo obligatorio (correcciones, alertas, captura degradada).
export function motivoValido(t, minimo = 5) {
  return textoLimpio(t).length >= minimo;
}

// Horas extra: 0 a 16, en pasos de media hora. Acepta coma decimal.
export function parsearHoras(valor) {
  const s = String(valor ?? '').trim().replace(',', '.');
  if (s === '') return 0;
  if (!/^\d{1,2}(\.\d{1,2})?$/.test(s)) return null;
  const n = Number(s);
  if (!(n >= 0 && n <= 16)) return null;
  if (Math.round(n * 2) !== n * 2) return null;
  return n;
}

// Fila de la pantalla de campo -> fila para reportes_horas, o lista de errores.
export function filaReporteCampo({ empleadoId, fecha, trabajo, extrasDiurnas, extrasFestivas, festivoTrabajado }) {
  const errores = [];
  if (!empleadoId) errores.push('Falta la persona.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha || '')) errores.push('Falta la fecha.');
  if (trabajo !== true && trabajo !== false) errores.push('Marca si trabajó o no.');
  const diurnas = parsearHoras(extrasDiurnas);
  const festivas = parsearHoras(extrasFestivas);
  if (diurnas === null) errores.push('Horas extra diurnas: escribe un número de 0 a 16 (puede ser media hora, por ejemplo 1.5).');
  if (festivas === null) errores.push('Horas extra festivas: escribe un número de 0 a 16 (puede ser media hora, por ejemplo 1.5).');
  if (trabajo === false && ((diurnas || 0) > 0 || (festivas || 0) > 0 || festivoTrabajado)) {
    errores.push('Si no trabajó, no puede tener horas extra ni festivo.');
  }
  if (errores.length) return { errores };
  return {
    errores: [],
    fila: {
      empleado_id: empleadoId,
      fecha,
      dia_trabajado: trabajo,
      horas_extra_diurnas: trabajo ? diurnas : 0,
      horas_extra_festivas: trabajo ? festivas : 0,
      festivo_trabajado: trabajo ? Boolean(festivoTrabajado) : false,
    },
  };
}

// Hash SHA-256 digitado: se aceptan espacios y mayúsculas, pero deben ser 64 hex.
export function normalizarSha256(t) {
  const s = String(t ?? '').replace(/\s+/g, '').toLowerCase();
  return /^[0-9a-f]{64}$/.test(s) ? s : null;
}

// Pesos digitados: "1.234.567", "1234567", "1.234.567,50", "$ 1.234.567".
export function parsearPesos(t) {
  let s = String(t ?? '').replace(/[\s$]/g, '');
  if (s === '') return null;
  if (!/^\d{1,3}(\.\d{3})*(,\d{1,2})?$|^\d+(,\d{1,2})?$/.test(s)) return null;
  s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

const FORMATO_PESOS = new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', minimumFractionDigits: 0, maximumFractionDigits: 2 });
export function formatoPesos(n) {
  return FORMATO_PESOS.format(Number(n) || 0);
}

// Error de red en supabase-js (sin señal o tiempo agotado), para la cola offline.
export function esErrorDeRedSupabase(error, status) {
  if (!error) return false;
  if (status === 0) return true;
  if (status >= 500 || status === 401 || status === 408) return true;
  const m = String(error.message || '');
  return !error.code && /fetch|network|load failed|abort|timeout/i.test(m);
}

// Clave duplicada: el reporte ya había llegado.
export function esDuplicado(error) {
  return Boolean(error && error.code === '23505');
}
