/* /api/media?id=<id> — fotos y audio (base64) de un registro, aparte de la
   base principal para que esta siga liviana. */

import { redis } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const id = String((req.query && req.query.id) || '');
  /* admite los ids de registro (uid) y los de adjuntos del analista (resp_<id>, avi_<id>) */
  if (!/^[a-z0-9_]{6,60}$/i.test(id)) return res.status(400).json({ error: 'id inválido' });
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
        return res.status(413).json({ error: 'Adjuntos demasiado pesados (máx ~900 KB por registro). Usa menos fotos o un audio más corto.' });
      }
      await redis(['SET', clave, cuerpo]);
      return res.status(200).json({ ok: true });
    }
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({ error: 'Método no permitido' });
  } catch (e) {
    return res.status(e.sinCredenciales ? 500 : 502).json({ error: String(e.message || e) });
  }
}
