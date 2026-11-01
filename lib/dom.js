// Ayudas mínimas de DOM. Todo texto entra con textContent (nunca innerHTML con datos).

export const $ = (sel, raiz = document) => raiz.querySelector(sel);
export const $$ = (sel, raiz = document) => Array.from(raiz.querySelectorAll(sel));

export function el(tag, attrs = {}, ...hijos) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') n.className = v;
    else if (k === 'text') n.textContent = v;
    else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
    else if (v === true) n.setAttribute(k, '');
    else n.setAttribute(k, String(v));
  }
  for (const h of hijos.flat()) {
    if (h === null || h === undefined || h === false) continue;
    n.append(h instanceof Node ? h : document.createTextNode(String(h)));
  }
  return n;
}

export function vaciar(n) {
  while (n.firstChild) n.removeChild(n.firstChild);
  return n;
}

// Muestra solo una de las secciones con data-pantalla.
export function mostrarPantalla(nombre) {
  for (const s of $$('[data-pantalla]')) s.hidden = s.dataset.pantalla !== nombre;
  const t = $(`[data-pantalla="${nombre}"] h1, [data-pantalla="${nombre}"] h2`);
  if (t) { t.setAttribute('tabindex', '-1'); t.focus({ preventScroll: false }); }
}

export function aviso(nodo, texto, tipo = 'info') {
  nodo.textContent = texto || '';
  nodo.className = `aviso aviso-${tipo}`;
  nodo.hidden = !texto;
}
