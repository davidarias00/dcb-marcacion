// Detección de navegadores internos (WhatsApp, Instagram, Facebook y otros WebView)
// que suelen bloquear la cámara o el GPS. Lógica pura: recibe el user agent.

const APPS = [
  { app: 'whatsapp', re: /WhatsApp/i },
  { app: 'instagram', re: /Instagram/i },
  { app: 'facebook', re: /FBAN|FBAV|FB_IAB|FBIOS|Messenger/i },
];

export function plataforma(ua) {
  const s = String(ua || '');
  if (/Android/i.test(s)) return 'android';
  if (/iPhone|iPad|iPod/i.test(s)) return 'ios';
  return 'otra';
}

export function detectarNavegadorInterno(ua) {
  const s = String(ua || '');
  const plat = plataforma(s);
  for (const { app, re } of APPS) {
    if (re.test(s)) return { interno: true, app, plataforma: plat };
  }
  // WebView genérico de Android ("; wv)") usado por otras apps.
  if (plat === 'android' && /;\s*wv\)/.test(s)) return { interno: true, app: 'webview', plataforma: plat };
  return { interno: false, app: null, plataforma: plat };
}

const NOMBRE_APP = { whatsapp: 'WhatsApp', instagram: 'Instagram', facebook: 'Facebook', webview: 'otra app' };

// Texto corto para pedir que abra el enlace en Chrome o Safari.
export function instruccionesAbrir(det) {
  const dentro = `Abriste este enlace dentro de ${NOMBRE_APP[det.app] || 'otra app'}, y ahí la cámara no funciona bien.`;
  if (det.plataforma === 'ios') {
    return [dentro, 'Toca el botón de compartir o los tres puntos (···) y elige "Abrir en Safari".'];
  }
  if (det.plataforma === 'android') {
    return [dentro, 'Toca los tres puntos (⋮) arriba a la derecha y elige "Abrir en Chrome" o "Abrir en el navegador".'];
  }
  return [dentro, 'Abre este enlace en Chrome o Safari.'];
}

// Enlace intent:// que en Android abre la misma página en Chrome.
export function urlIntentChrome(url) {
  const u = new URL(url);
  const resto = u.host + u.pathname + u.search;
  const scheme = u.protocol.replace(':', '');
  return `intent://${resto}#Intent;scheme=${scheme};package=com.android.chrome;S.browser_fallback_url=${encodeURIComponent(url)};end`;
}
