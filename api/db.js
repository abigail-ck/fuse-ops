/* /api/db — base compartida de FUSE OPS.
   GET  → devuelve {registros, consultas, avisos}
   POST → fusiona lo entrante con lo guardado (unión por id, lo entrante gana)
          y devuelve la base resultante, para que dos perfiles guardando a la
          vez no se pisen.                                                    */

import { redis } from './_redis.js';

const CLAVE = 'fuse-ops:db';
const VACIA = { registros: [], consultas: [], avisos: [] };

function fusionarLista(actual, entrante) {
  const porId = new Map();
  (actual || []).forEach(x => { if (x && x.id) porId.set(x.id, x); });
  (entrante || []).forEach(x => { if (x && x.id) porId.set(x.id, x); }); // entrante gana
  return [...porId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function saneada(x) {
  if (!x || typeof x !== 'object') return { ...VACIA };
  return {
    registros: Array.isArray(x.registros) ? x.registros : [],
    consultas: Array.isArray(x.consultas) ? x.consultas : [],
    avisos: Array.isArray(x.avisos) ? x.avisos : []
  };
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
      const resultado = {
        registros: fusionarLista(actual.registros, entrante.registros),
        consultas: fusionarLista(actual.consultas, entrante.consultas),
        avisos: fusionarLista(actual.avisos, entrante.avisos)
      };
      await redis(['SET', CLAVE, JSON.stringify(resultado)]);
      return res.status(200).json(resultado);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(e.sinCredenciales ? 500 : 502).json({ error: String(e.message || e) });
  }
}
