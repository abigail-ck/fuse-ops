/* /api/db — base compartida de FUSE OPS.
   GET  → devuelve {registros, consultas, avisos}
   POST → fusiona lo entrante con lo guardado (unión por id, lo entrante gana)
          y devuelve la base resultante, para que dos perfiles guardando a la
          vez no se pisen.                                                    */

import { redis } from './_redis.js';

const CLAVE = 'fuse-ops:db';
const VACIA = { registros: [], consultas: [], avisos: [], tareas: [], personas: [], checks: [] };
const LISTAS = Object.keys(VACIA);

function fusionarLista(actual, entrante) {
  const porId = new Map();
  (actual || []).forEach(x => { if (x && x.id) porId.set(x.id, x); });
  (entrante || []).forEach(x => { if (x && x.id) porId.set(x.id, x); }); // entrante gana
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
      LISTAS.forEach(k => { resultado[k] = fusionarLista(actual[k], entrante[k]); });
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
