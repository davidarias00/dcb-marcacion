// Ubicación en el momento de marcar: alta precisión, hasta ~15 s, se queda con la mejor lectura.
import { mejorPosicion } from '../lib/marcacion.js';

export const TIMEOUT_MS = 15000;
export const PRECISION_BUENA_M = 30;

// alCambiar({ posicion, error, terminado }) se llama con cada novedad.
export function iniciarGPS(alCambiar) {
  let posicion = null;
  let error = null;
  let terminado = false;
  let watchId = null;
  let timer = null;
  const esperando = [];

  function terminar() {
    if (terminado) return;
    terminado = true;
    if (watchId !== null) navigator.geolocation.clearWatch(watchId);
    clearTimeout(timer);
    alCambiar({ posicion, error, terminado });
    for (const r of esperando.splice(0)) r({ posicion, error });
  }

  if (!('geolocation' in navigator)) {
    error = 'no_disponible';
    setTimeout(terminar, 0);
  } else {
    watchId = navigator.geolocation.watchPosition(
      (p) => {
        posicion = mejorPosicion(posicion, {
          lat: p.coords.latitude, lng: p.coords.longitude, precision: p.coords.accuracy,
        });
        error = null;
        alCambiar({ posicion, error, terminado });
        if (posicion.precision <= PRECISION_BUENA_M) terminar();
      },
      (e) => {
        error = e.code === 1 ? 'denegada' : e.code === 3 ? 'tiempo' : 'no_disponible';
        if (e.code === 1) terminar();
        else alCambiar({ posicion, error, terminado });
      },
      { enableHighAccuracy: true, timeout: TIMEOUT_MS, maximumAge: 0 },
    );
    timer = setTimeout(terminar, TIMEOUT_MS);
  }

  return {
    // Espera a que termine (buena precisión, permiso negado o tiempo agotado).
    esperar() {
      if (terminado) return Promise.resolve({ posicion, error });
      return new Promise((r) => esperando.push(r));
    },
    detener: terminar,
  };
}

export function textoGPS({ posicion, error, terminado }) {
  if (posicion) {
    const m = Math.round(posicion.precision);
    return terminado || m <= PRECISION_BUENA_M
      ? `Ubicación tomada (precisión ${m} m).`
      : `Ubicación aproximada (precisión ${m} m). Buscando una mejor…`;
  }
  if (error === 'denegada') {
    return 'No diste permiso de ubicación. Igual puedes marcar, pero tu marcación quedará en revisión.';
  }
  if (terminado) return 'No pudimos tomar tu ubicación. Igual puedes marcar, pero tu marcación quedará en revisión.';
  return 'Buscando tu ubicación…';
}
