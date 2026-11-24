// Envío de las marcaciones guardadas sin señal desde el service worker (Background Sync).
// Chrome en Android despierta al service worker cuando vuelve la señal, aunque la página esté
// cerrada. Script clásico (lo carga sw.js con importScripts): no usa import ni export.
// Usa la misma base de IndexedDB que la página (lib/cola.js): 'dcb-marcacion', store 'cola'.
(function (g) {
  const DB = 'dcb-marcacion';
  const STORE = 'cola';

  function prometer(req) {
    return new Promise((ok, ko) => {
      req.onsuccess = () => ok(req.result);
      req.onerror = () => ko(req.error);
    });
  }

  // Almacén sobre IndexedDB con la misma forma que el de la página: put, getAll y delete.
  function almacenIndexedDBSW(idb) {
    let dbPromesa = null;
    function db() {
      if (!dbPromesa) {
        const req = idb.open(DB, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE, { keyPath: 'id' });
        };
        dbPromesa = prometer(req);
      }
      return dbPromesa;
    }
    async function tx(modo, fn) {
      const d = await db();
      return new Promise((ok, ko) => {
        const t = d.transaction(STORE, modo);
        let resultado;
        prometer(fn(t.objectStore(STORE))).then((r) => { resultado = r; }, ko);
        t.oncomplete = () => ok(resultado);
        t.onerror = () => ko(t.error);
        t.onabort = () => ko(t.error);
      });
    }
    return {
      put: (item) => tx('readwrite', (os) => os.put(item)),
      getAll: () => tx('readonly', (os) => os.getAll()),
      delete: (id) => tx('readwrite', (os) => os.delete(id)),
    };
  }

  // Envía en orden (la entrada antes que la salida). Se detiene ante el primer problema de red,
  // del servidor o del celular (desvinculado), para no desordenar la secuencia: lo que queda lo
  // reintenta el navegador o la página al abrirse. Un rechazo definitivo queda como 'fallida'
  // para que la página se lo muestre a la persona.
  async function enviarColaSW({ almacen, fetchImpl, ahora = () => new Date() }) {
    const res = { enviadas: 0, fallidas: 0, pendientes: 0 };
    const items = (await almacen.getAll())
      .filter((i) => i.estado === 'pendiente' && i.envio && i.envio.url && i.envio.dispositivo)
      .sort((a, b) => (a.creado_ms - b.creado_ms) || String(a.id).localeCompare(String(b.id)));
    for (let k = 0; k < items.length; k++) {
      const item = items[k];
      let r;
      try {
        r = await fetchImpl(item.envio.url, {
          method: 'POST',
          headers: { apikey: item.envio.apikey, 'Content-Type': 'application/json', 'x-dispositivo': item.envio.dispositivo },
          body: JSON.stringify({ ...item.cuerpo, ts_envio_dispositivo: ahora().toISOString() }),
          cache: 'no-store',
        });
      } catch {
        res.pendientes = items.length - k;
        return res;
      }
      if (r.ok) {
        await almacen.delete(item.id);
        res.enviadas++;
        continue;
      }
      let datos = null;
      try { datos = await r.json(); } catch { datos = null; }
      const codigo = datos && datos.error;
      const reintentar = r.status >= 500 || r.status === 429
        || codigo === 'dispositivo_no_vinculado' || codigo === 'dispositivo_revocado';
      if (reintentar) {
        res.pendientes = items.length - k;
        return res;
      }
      await almacen.put({ ...item, estado: 'fallida', mensaje: (datos && datos.mensaje) || 'No se pudo enviar.' });
      res.fallidas++;
    }
    return res;
  }

  g.enviarColaSW = enviarColaSW;
  g.almacenIndexedDBSW = almacenIndexedDBSW;
})(typeof self !== 'undefined' ? self : globalThis);
