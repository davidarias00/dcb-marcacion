// Cola offline: guarda lo que no se pudo enviar y lo reenvía cuando vuelve la señal.
// La lógica de la cola no depende de IndexedDB: recibe un "almacén" con
// put(item), getAll() y delete(id). Hay uno en memoria (pruebas) y uno con IndexedDB.

import { nuevoId } from './ids.js';

// Resultados que devuelve la función enviar(item) al procesar:
//   { accion: 'ok', respuesta }        -> se envió (o el servidor ya lo tenía): se quita
//   { accion: 'reintentar' }           -> sin señal o error del servidor: se deja y se para
//   { accion: 'descartar', mensaje }   -> el servidor lo rechazó: queda como fallida para mostrarla
//   { accion: 'detener', motivo }      -> no se puede seguir (por ejemplo, celular sin vincular)
export function crearCola(almacen) {
  let enCurso = null;

  async function listar() {
    const todos = await almacen.getAll();
    return todos.sort((a, b) => (a.creado_ms - b.creado_ms) || String(a.id).localeCompare(String(b.id)));
  }

  async function agregar(datos, ahora = Date.now()) {
    const item = { id: datos.id || nuevoId(), creado_ms: ahora, estado: 'pendiente', intentos: 0, ...datos };
    await almacen.put(item);
    return item;
  }

  async function pendientes() {
    return (await listar()).filter((i) => i.estado === 'pendiente');
  }

  async function fallidas() {
    return (await listar()).filter((i) => i.estado === 'fallida');
  }

  async function quitar(id) {
    await almacen.delete(id);
  }

  async function correr(enviar) {
    const res = { enviadas: [], fallidas: [], pendientes: 0, detenida: null };
    const lista = await pendientes();
    for (let i = 0; i < lista.length; i++) {
      const item = lista[i];
      let r;
      try {
        r = await enviar(item);
      } catch {
        r = { accion: 'reintentar' };
      }
      const accion = r && r.accion;
      if (accion === 'ok') {
        await almacen.delete(item.id);
        res.enviadas.push({ item, respuesta: r.respuesta });
      } else if (accion === 'descartar') {
        const f = { ...item, estado: 'fallida', mensaje: r.mensaje || 'No se pudo enviar.' };
        await almacen.put(f);
        res.fallidas.push(f);
      } else {
        await almacen.put({ ...item, intentos: (item.intentos || 0) + 1 });
        res.pendientes = lista.length - i;
        res.detenida = accion === 'detener' ? (r.motivo || 'detenida') : 'sin_conexion';
        return res;
      }
    }
    return res;
  }

  // Un solo procesamiento a la vez: si ya hay uno, devuelve ese mismo.
  function procesar(enviar) {
    if (!enCurso) {
      enCurso = correr(enviar).finally(() => { enCurso = null; });
    }
    return enCurso;
  }

  return { agregar, listar, pendientes, fallidas, quitar, procesar };
}

export function almacenMemoria() {
  const datos = new Map();
  return {
    async put(item) { datos.set(item.id, structuredClone(item)); },
    async getAll() { return Array.from(datos.values(), (x) => structuredClone(x)); },
    async delete(id) { datos.delete(id); },
  };
}

function prometer(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

// Almacén en IndexedDB (una base por pantalla, un solo object store con keyPath id).
export function almacenIndexedDB(nombreDb, store = 'cola', idb = globalThis.indexedDB) {
  if (!idb) throw new Error('IndexedDB no disponible');
  let dbPromesa = null;
  function db() {
    if (!dbPromesa) {
      dbPromesa = new Promise((resolve, reject) => {
        const req = idb.open(nombreDb, 1);
        req.onupgradeneeded = () => {
          if (!req.result.objectStoreNames.contains(store)) {
            req.result.createObjectStore(store, { keyPath: 'id' });
          }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => { dbPromesa = null; reject(req.error); };
      });
    }
    return dbPromesa;
  }
  async function tx(modo, fn) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const t = d.transaction(store, modo);
      const os = t.objectStore(store);
      let resultado;
      prometer(fn(os)).then((r) => { resultado = r; }, reject);
      t.oncomplete = () => resolve(resultado);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
    });
  }
  return {
    put: (item) => tx('readwrite', (os) => os.put(item)),
    getAll: () => tx('readonly', (os) => os.getAll()),
    delete: (id) => tx('readwrite', (os) => os.delete(id)),
  };
}

// IndexedDB si existe; si no (modo privado viejo, etc.), memoria. El segundo valor
// dice si lo guardado sobrevive a cerrar la página.
export function almacenPreferido(nombreDb) {
  try {
    if (globalThis.indexedDB) return { almacen: conRespaldoEnMemoria(almacenIndexedDB(nombreDb)), persistente: true };
  } catch { /* sigue con memoria */ }
  return { almacen: almacenMemoria(), persistente: false };
}

// Si IndexedDB falla al usarlo (página aislada, permisos), sigue en memoria sin romper la página.
export function conRespaldoEnMemoria(principal) {
  const memoria = almacenMemoria();
  let actual = principal;
  const usar = (op) => async (...args) => {
    try {
      return await actual[op](...args);
    } catch (e) {
      if (actual === memoria) throw e;
      actual = memoria;
      return memoria[op](...args);
    }
  };
  return { put: usar('put'), getAll: usar('getAll'), delete: usar('delete') };
}
