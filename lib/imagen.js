// Parámetros de compresión de la selfie. Lógica pura: el codificador (canvas.toDataURL)
// se inyecta, así se prueba sin navegador.

export const ANCHO_MAX = 480;
export const OBJETIVO_BYTES = 100 * 1024;
export const CALIDADES = [0.8, 0.7, 0.6, 0.5, 0.42, 0.35, 0.28];

// Escala (ancho, alto) para que el ancho no pase de max, sin agrandar.
export function dimensionesDestino(ancho, alto, max = ANCHO_MAX) {
  if (!(ancho > 0) || !(alto > 0)) throw new Error('dimensiones inválidas');
  if (ancho <= max) return { ancho: Math.round(ancho), alto: Math.round(alto) };
  const f = max / ancho;
  return { ancho: Math.round(max), alto: Math.max(1, Math.round(alto * f)) };
}

export function quitarPrefijoDataUrl(dataUrl) {
  const i = String(dataUrl).indexOf(',');
  return i >= 0 ? dataUrl.slice(i + 1) : String(dataUrl);
}

// Bytes binarios que representa un texto base64.
export function bytesDeBase64(b64) {
  const s = String(b64).replace(/\s/g, '');
  if (s.length === 0) return 0;
  const relleno = s.endsWith('==') ? 2 : s.endsWith('=') ? 1 : 0;
  return Math.floor((s.length * 3) / 4) - relleno;
}

// Prueba calidades de mayor a menor hasta quedar bajo el objetivo.
// codificar(calidad) -> dataURL JPEG. Devuelve { base64, bytes, calidad }.
export function comprimirConCalidad(codificar, { objetivo = OBJETIVO_BYTES, calidades = CALIDADES } = {}) {
  let ultimo = null;
  for (const calidad of calidades) {
    const base64 = quitarPrefijoDataUrl(codificar(calidad));
    const bytes = bytesDeBase64(base64);
    ultimo = { base64, bytes, calidad };
    if (bytes <= objetivo) return ultimo;
  }
  return ultimo;
}
