// Evita que otra página muestre el portal dentro de un recuadro (clickjacking) cuando el
// hosting no permite la cabecera frame-ancestors (por ejemplo, GitHub Pages).
if (window.top !== window.self) {
  document.documentElement.style.display = 'none';
  try { window.top.location = window.self.location.href; } catch { /* el navegador lo impide: queda oculta */ }
}
