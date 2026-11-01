// Cámara frontal en vivo (getUserMedia). Nunca se usa <input type="file"> ni la galería.
import { dimensionesDestino, comprimirConCalidad, ANCHO_MAX } from '../lib/imagen.js';

export function camaraDisponible() {
  return Boolean(navigator.mediaDevices && typeof navigator.mediaDevices.getUserMedia === 'function');
}

export function mensajeErrorCamara(err) {
  const n = err && err.name;
  if (n === 'NotAllowedError' || n === 'SecurityError') {
    return 'No diste permiso para usar la cámara. Toca el candado o el ícono junto a la dirección de la página, busca "Cámara" y elige "Permitir". Luego vuelve a intentar.';
  }
  if (n === 'NotFoundError' || n === 'OverconstrainedError') return 'No encontramos la cámara frontal de tu celular.';
  if (n === 'NotReadableError' || n === 'AbortError') return 'La cámara está ocupada por otra app. Ciérrala y vuelve a intentar.';
  return 'No se pudo abrir la cámara. Cierra y vuelve a abrir el navegador.';
}

export async function abrirCamara(video) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: false,
    video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } },
  });
  video.srcObject = stream;
  await new Promise((resolve) => {
    if (video.readyState >= 2 && video.videoWidth > 0) return resolve();
    video.addEventListener('loadeddata', () => resolve(), { once: true });
  });
  try { await video.play(); } catch { /* autoplay muted suele bastar */ }
  return stream;
}

export function cerrarCamara(stream, video) {
  if (stream) for (const t of stream.getTracks()) t.stop();
  if (video) video.srcObject = null;
}

// Captura el cuadro actual en un canvas y lo comprime a JPEG (~100 KB, ancho máx. 480 px).
// Devuelve { base64 (sin prefijo), dataUrl, bytes }.
export function capturar(video) {
  const w = video.videoWidth;
  const h = video.videoHeight;
  if (!w || !h) throw new Error('La cámara todavía no está lista.');
  const d = dimensionesDestino(w, h, ANCHO_MAX);
  const canvas = document.createElement('canvas');
  canvas.width = d.ancho;
  canvas.height = d.alto;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(video, 0, 0, d.ancho, d.alto);
  const r = comprimirConCalidad((q) => canvas.toDataURL('image/jpeg', q));
  return { base64: r.base64, dataUrl: `data:image/jpeg;base64,${r.base64}`, bytes: r.bytes };
}
