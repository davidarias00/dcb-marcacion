// Validación del formulario de la pestaña Personas. Lógica pura.
// La base vuelve a validar todo en guardar_empleado(); esto solo da mensajes claros antes de enviar.
import { textoLimpio } from './validacion.js';

const GRUPO_POR_FRENTE = { A: 'vinculado', B: 'por_dias' };

// '1.040.050.219' -> '1040050219'; null si no son 5 a 12 dígitos.
export function normalizarCedula(t) {
  const s = String(t ?? '').replace(/[.\s-]/g, '');
  return /^[0-9]{5,12}$/.test(s) ? s : null;
}

// '300 123 4567', '+57 300...' -> '573001234567'; null si no es un celular colombiano.
export function normalizarWhatsapp(t) {
  const d = String(t ?? '').replace(/\D/g, '');
  if (/^3[0-9]{9}$/.test(d)) return `57${d}`;
  if (/^573[0-9]{9}$/.test(d)) return d;
  return null;
}

// Datos del formulario -> { errores, datos, cedula, whatsapp }. esNueva exige cédula y WhatsApp.
export function validarPersona(f, esNueva) {
  const errores = [];
  const nombre = textoLimpio(f.nombre_completo);
  if (nombre.split(' ').length < 2 || nombre.length < 5) errores.push('Escribe el nombre completo, con apellidos.');
  if (!['A', 'B', 'C'].includes(f.frente)) errores.push('Elige el frente.');
  const grupo = GRUPO_POR_FRENTE[f.frente] ?? f.grupo;
  if (f.frente === 'C' && !['campo', 'aseo'].includes(grupo)) errores.push('En el frente C elige si es campo o aseo.');
  if (['A', 'B'].includes(f.frente) && !f.regimen_id) errores.push('Elige el régimen (Jornal 8 h, 5 días o 6 días).');
  if (f.grupo !== 'campo' && f.frente !== 'C' && !f.ubicacion_base_id) errores.push('Elige el punto base.');
  if (f.activo === false && !f.fecha_retiro) errores.push('Para retirar a la persona escribe la fecha de retiro.');

  const cedula = f.cedula ? normalizarCedula(f.cedula) : null;
  const whatsapp = f.whatsapp ? normalizarWhatsapp(f.whatsapp) : null;
  if (f.cedula && !cedula) errores.push('La cédula debe tener de 5 a 12 números.');
  if (f.whatsapp && !whatsapp) errores.push('El WhatsApp debe ser un celular de Colombia (10 números, empieza por 3).');
  if (esNueva && !f.cedula) errores.push('Falta la cédula.');
  if (esNueva && !f.whatsapp) errores.push('Falta el WhatsApp.');

  const datos = {
    nombre_completo: nombre,
    frente: f.frente,
    grupo,
    regimen_id: f.regimen_id || null,
    ubicacion_base_id: f.ubicacion_base_id || null,
    marca_en_cualquier_punto: Boolean(f.marca_en_cualquier_punto),
    paga_begranda: Boolean(f.paga_begranda),
    medio_pago: f.medio_pago === 'efectivo' ? 'efectivo' : 'banco',
    cargo: textoLimpio(f.cargo) || null,
    fecha_ingreso: f.fecha_ingreso || null,
    activo: f.activo !== false,
    fecha_retiro: f.activo === false ? f.fecha_retiro : null,
  };
  return { errores, datos, cedula, whatsapp };
}
