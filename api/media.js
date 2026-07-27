/* /api/media?id=<id> — adjuntos (fotos y audio en base64) de un registro.
   GET  → {fotos, audio} o 404 si no existen.
   POST → guarda el cuerpo tal cual bajo la clave del registro.
   Se separan de /api/db para que la base principal siga liviana.            */

const URL_ = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
const TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;

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

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (!URL_ || !TOKEN) {
    return res.status(500).json({ error: 'Falta conectar Upstash Redis al proyecto (pestaña Storage de Vercel).' });
  }
  const id = String((req.query && req.query.id) || '');
  if (!/^[a-z0-9]{6,40}$/i.test(id)) return res.status(400).json({ error: 'id inválido' });
  const clave = 'fuse-ops:media:' + id;
  try {
    if (req.method === 'GET') {
      const v = await redis(['GET', clave]);
      if (!v) return res.status(404).json({ error: 'not found' });
      res.setHeader('Content-Type', 'application/json');
      return res.status(200).send(v);
    }
    if (req.method === 'POST') {
      const cuerpo = typeof req.body === 'string' ? req.body : JSON.stringify(req.body || {});
      if (cuerpo.length > 900000) {
        return res.status(413).json({ error: 'Adjuntos demasiado pesados para el plan gratuito (máx ~900 KB por registro). Usa menos fotos o audio más corto.' });
      }
      await redis(['SET', clave, cuerpo]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(502).json({ error: 'Error de almacenamiento: ' + String(e.message || e) });
  }
}
