// Cliente de las edge functions del portal (docs/11-api-portal.md).
// Siempre devuelve un resultado; nunca lanza por errores de red.
//   { tipo: 'ok', status, datos }
//   { tipo: 'error', status, codigo, mensaje }   -> el servidor respondió 4xx con su mensaje
//   { tipo: 'red', status }                      -> sin señal, tiempo agotado o 5xx: se puede reintentar

const MENSAJES = {
  qr_invalido: 'Este QR no es válido o ya no sirve. Usa el QR pegado en el punto.',
  dispositivo_no_vinculado: 'Este celular no está vinculado. Vamos a vincularlo.',
  dispositivo_revocado: 'Este celular ya no está vinculado. Vuelve a vincularlo.',
  demasiados_intentos: 'Hiciste muchos intentos. Espera un rato y vuelve a intentar.',
  codigo_invalido: 'El código no es correcto. Revísalo e intenta otra vez.',
  codigo_vencido: 'El código se venció. Pide uno nuevo.',
  selfie_requerida: 'Falta la selfie. Tómala otra vez.',
  ubicacion_no_permitida: 'No puedes marcar en este punto.',
  datos_invalidos: 'Algo en los datos no está bien. Intenta otra vez.',
};

export function mensajePorCodigo(codigo) {
  return MENSAJES[codigo] || 'No se pudo completar. Intenta otra vez.';
}

// Convierte status + cuerpo ya leído en el resultado. Pura.
export function clasificarRespuesta(status, cuerpo) {
  if (status >= 200 && status < 300) return { tipo: 'ok', status, datos: cuerpo };
  if (status >= 400 && status < 500 && status !== 408) {
    const codigo = cuerpo && typeof cuerpo.error === 'string' ? cuerpo.error : 'desconocido';
    const mensaje = cuerpo && typeof cuerpo.mensaje === 'string' && cuerpo.mensaje
      ? cuerpo.mensaje : mensajePorCodigo(codigo);
    return { tipo: 'error', status, codigo, mensaje };
  }
  return { tipo: 'red', status };
}

// Errores que no se arreglan reintentando el mismo envío.
export function esDefinitivo(resultado) {
  return resultado.tipo === 'error' && resultado.codigo !== 'demasiados_intentos';
}

export function esDispositivoInvalido(resultado) {
  return resultado.tipo === 'error'
    && (resultado.codigo === 'dispositivo_no_vinculado' || resultado.codigo === 'dispositivo_revocado');
}

export function crearClienteApi({ base, apikey, fetchImpl = globalThis.fetch, timeoutMs = 30000 }) {
  async function llamar(ruta, { metodo = 'POST', cuerpo, dispositivo, dispositivoAnterior, timeout = timeoutMs } = {}) {
    const headers = { apikey };
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';
    if (dispositivo) headers['x-dispositivo'] = dispositivo;
    // Token que tenía este navegador antes de vincular (alerta de celular compartido).
    if (dispositivoAnterior) headers['x-dispositivo-anterior'] = dispositivoAnterior;
    const ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), timeout) : null;
    try {
      const r = await fetchImpl(`${base}/${ruta}`, {
        method: metodo,
        headers,
        body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo),
        signal: ctrl ? ctrl.signal : undefined,
        cache: 'no-store',
      });
      let datos = null;
      try { datos = await r.json(); } catch { datos = null; }
      return clasificarRespuesta(r.status, datos);
    } catch {
      return { tipo: 'red', status: 0 };
    } finally {
      if (timer) clearTimeout(timer);
    }
  }
  return { llamar };
}
