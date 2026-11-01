// Dibuja un QR por punto para imprimir (librería qrcode-generator 1.4.4, global `qrcode`).
import { $, el, vaciar, aviso } from '../lib/dom.js';
import { parsearListaQR } from '../lib/qrlista.js';

$('#base').value = new URL('../m/', location.href).toString();

function svgQR(texto) {
  const qr = globalThis.qrcode(0, 'M');
  qr.addData(texto);
  qr.make();
  // createSvgTag escapa el título; el resto es geometría generada por la librería.
  const tmp = document.createElement('div');
  tmp.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 4, scalable: true, title: 'Código QR para marcar' });
  return tmp.firstElementChild;
}

$('#btn-dibujar').addEventListener('click', () => {
  const av = $('#aviso');
  const hojas = vaciar($('#hojas'));
  $('#btn-imprimir').disabled = true;
  if (typeof globalThis.qrcode !== 'function') return aviso(av, 'No cargó la librería de QR. Revisa la conexión.', 'error');
  let base;
  try { base = new URL($('#base').value).toString(); } catch { return aviso(av, 'La dirección de la página de marcación no es válida.', 'error'); }
  const { puntos, errores } = parsearListaQR($('#lista').value, base);
  for (const p of puntos) {
    hojas.append(el('section', { class: 'hoja-qr' },
      el('p', { class: 'nombre', text: p.nombre }),
      el('p', { text: 'Marca aquí tu entrada y tu salida' }),
      svgQR(p.url),
      el('ol', {},
        el('li', { text: 'Abre la cámara del celular y apunta a este código.' }),
        el('li', { text: 'Toca el enlace que aparece. Ábrelo en Chrome o Safari.' }),
        el('li', { text: 'Toma tu selfie y toca "Marcar ahora".' })),
      el('p', { class: 'suave', text: `Versión del QR: ${p.version}` })));
  }
  const textoErr = errores.length ? ` Errores: ${errores.join(' ')}` : '';
  aviso(av, `${puntos.length} QR listos.${textoErr}`, errores.length ? 'alerta' : 'ok');
  $('#btn-imprimir').disabled = puntos.length === 0;
});

$('#btn-imprimir').addEventListener('click', () => window.print());
