/* /api/db — base compartida de FUSE OPS.
   GET  → devuelve {registros, consultas, avisos}
   POST → fusiona lo entrante con lo guardado (unión por id, lo entrante gana)
          y devuelve la base resultante, para que dos perfiles guardando a la
          vez no se pisen.                                                    */

import { redis } from './_redis.js';

const CLAVE = 'fuse-ops:db';
const VACIA = { registros: [], consultas: [], avisos: [], tareas: [], personas: [], checks: [] };
const LISTAS = Object.keys(VACIA);

/* Fusión por id con protección de campos que solo crecen.
   "El entrante gana" a secas tiene un hueco con dos dispositivos: un cliente
   con copia vieja puede pisar en el servidor lo que otro acaba de escribir
   (una actualización de incidente, un "leído", una respuesta). Por eso, para
   el mismo id se combinan ambos objetos y los campos acumulativos se unen. */
function fusionarObjeto(k, a, e) {
  const out = { ...a, ...e }; // los campos simples los decide el entrante
  if (k === 'registros') {
    // el seguimiento es un historial: unión por (ts+texto), orden cronológico
    const vistas = new Map();
    [...(a.actualizaciones || []), ...(e.actualizaciones || [])].forEach(x => {
      if (x) vistas.set((x.ts || 0) + '|' + (x.texto || ''), x);
    });
    const acts = [...vistas.values()].sort((x, y) => (x.ts || 0) - (y.ts || 0));
    if (acts.length) out.actualizaciones = acts;
    out.visto = !!(a.visto || e.visto);          // leído no se des-lee
  }
  if (k === 'avisos') out.leido = !!(a.leido || e.leido);
  if (k === 'consultas') {
    out.respuesta = e.respuesta || a.respuesta || null; // una respuesta no se borra
    out.vista = !!(a.vista || e.vista);
  }
  if (k === 'tareas' || k === 'personas' || k === 'checks') {
    /* protección multi-dispositivo: cada mutación del cliente lleva un sello
       `mod`. Para el mismo id gana la copia con el sello más reciente, así una
       copia vieja que guarda encima NO revierte ediciones, reordenamientos ni
       marcas hechas desde otro teléfono. (Sin sello = 0: los datos antiguos
       conservan el comportamiento previo de "entrante gana".) */
    const modA = a.mod || 0, modE = e.mod || 0;
    const ganador = modE >= modA ? { ...a, ...e } : { ...e, ...a };
    Object.keys(out).forEach(c => delete out[c]);
    Object.assign(out, ganador);
    if (k !== 'checks') out.eliminada = !!(a.eliminada || e.eliminada); // borrado lógico: no resucita
  }
  return out;
}
function fusionarLista(k, actual, entrante) {
  const porId = new Map();
  (actual || []).forEach(x => { if (x && x.id) porId.set(x.id, x); });
  (entrante || []).forEach(x => {
    if (!x || !x.id) return;
    const previo = porId.get(x.id);
    porId.set(x.id, previo ? fusionarObjeto(k, previo, x) : x);
  });
  return [...porId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function saneada(x) {
  const out = {};
  LISTAS.forEach(k => { out[k] = (x && Array.isArray(x[k])) ? x[k] : []; });
  return out;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', CLAVE]);
      return res.status(200).json(v ? saneada(JSON.parse(v)) : { ...VACIA });
    }
    if (req.method === 'POST') {
      const entrante = saneada(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      const v = await redis(['GET', CLAVE]);
      const actual = v ? saneada(JSON.parse(v)) : { ...VACIA };
      const resultado = {};
      LISTAS.forEach(k => { resultado[k] = fusionarLista(k, actual[k], entrante[k]); });
      await redis(['SET', CLAVE, JSON.stringify(resultado)]);
      return res.status(200).json(resultado);
    }
    if (req.method === 'DELETE') {
      /* reinicio total: la plataforma queda como recién instalada */
      await redis(['SET', CLAVE, JSON.stringify(VACIA)]);
      let borradas = 0;
      try {
        const claves = await redis(['KEYS', 'fuse-ops:media:*']);
        if (Array.isArray(claves) && claves.length) {
          await redis(['DEL', ...claves]);
          borradas = claves.length;
        }
      } catch (e) { /* si el proveedor no permite KEYS, la base igual quedó vacía */ }
      return res.status(200).json({ ...VACIA, reiniciada: true, adjuntosBorrados: borradas });
    }
    res.setHeader('Allow', 'GET, POST, DELETE');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(e.sinCredenciales ? 500 : 502).json({ error: String(e.message || e) });
  }
}
