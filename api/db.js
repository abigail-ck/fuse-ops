/* /api/db — base compartida de FUSE OPS sobre Upstash Redis.
   GET  → devuelve {registros, consultas, avisos}
   POST → fusiona lo entrante con lo guardado (unión por id, lo entrante gana
          en conflicto) y devuelve la base resultante. La fusión evita que dos
          perfiles guardando a la vez se pisen los registros.                 */

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
const CLAVE = 'fuse-ops:db';
const VACIA = { registros: [], consultas: [], avisos: [] };

async function redis(cmd) {
  const r = await fetch(URL_, {
    method: 'POST',
    headers: { Authorization: `Bearer ${TOKEN}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  if (!r.ok) throw new Error('Redis respondió ' + r.status);
  const j = await r.json();
  if (j.error) throw new Error(j.error);
  return j.result;
}

function fusionarLista(actual, entrante) {
  const porId = new Map();
  (actual || []).forEach(x => { if (x && x.id) porId.set(x.id, x); });
  (entrante || []).forEach(x => { if (x && x.id) porId.set(x.id, x); }); // entrante gana
  return [...porId.values()].sort((a, b) => (a.ts || 0) - (b.ts || 0));
}
function fusionar(actual, entrante) {
  return {
    registros: fusionarLista(actual.registros, entrante.registros),
    consultas: fusionarLista(actual.consultas, entrante.consultas),
    avisos: fusionarLista(actual.avisos, entrante.avisos)
  };
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
  if (!URL_ || !TOKEN) {
    return res.status(500).json({
      error: 'Falta la base de datos. En Vercel: pestaña Storage → Create Database → Upstash for Redis → Connect Project, y vuelve a desplegar.'
    });
  }
  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', CLAVE]);
      return res.status(200).json(v ? saneada(JSON.parse(v)) : { ...VACIA });
    }
    if (req.method === 'POST') {
      const entrante = saneada(typeof req.body === 'string' ? JSON.parse(req.body) : req.body);
      const v = await redis(['GET', CLAVE]);
      const actual = v ? saneada(JSON.parse(v)) : { ...VACIA };
      const resultado = fusionar(actual, entrante);
      await redis(['SET', CLAVE, JSON.stringify(resultado)]);
      return res.status(200).json(resultado);
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(502).json({ error: 'Error de almacenamiento: ' + String(e.message || e) });
  }
}
