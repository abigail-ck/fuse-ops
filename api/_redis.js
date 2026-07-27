/* Descubre las credenciales REST de Redis sin depender de un nombre exacto.
   Vercel/Upstash inyectan distintos nombres según la integración
   (UPSTASH_REDIS_REST_*, KV_REST_API_*, REDIS_URL, etc.). */

export function credenciales() {
  const e = process.env;

  // 1) parejas conocidas
  const pares = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['REDIS_REST_API_URL', 'REDIS_REST_API_TOKEN'],
    ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN']
  ];
  for (const [u, t] of pares) if (e[u] && e[t]) return { url: e[u], token: e[t], via: u };

  // 2) cualquier variable *_REST_URL / *_REST_API_URL con su token hermano
  for (const k of Object.keys(e)) {
    if (/REST_(API_)?URL$/.test(k) && /^https:\/\//.test(e[k] || '')) {
      const tk = k.replace(/URL$/, 'TOKEN');
      if (e[tk]) return { url: e[k], token: e[tk], via: k };
    }
  }

  // 3) derivar del connection string rediss://default:TOKEN@host:puerto
  for (const k of Object.keys(e)) {
    const m = /^rediss?:\/\/([^:]*):([^@]+)@([^:/]+)/.exec(e[k] || '');
    if (m) return { url: 'https://' + m[3], token: decodeURIComponent(m[2]), via: k };
  }

  return null;
}

/* nombres (no valores) de las variables que podrían servir — para diagnóstico */
export function variablesVisibles() {
  return Object.keys(process.env)
    .filter(k => /REDIS|KV_|UPSTASH|STORAGE/i.test(k))
    .sort();
}

export async function redis(cmd) {
  const c = credenciales();
  if (!c) {
    const vistas = variablesVisibles();
    const err = new Error(
      'Falta conectar la base de datos en Vercel (Storage → Create Database → Upstash for Redis → Connect Project, y luego Redeploy). ' +
      (vistas.length
        ? 'Variables detectadas en el proyecto: ' + vistas.join(', ') + '. Ninguna sirve como credencial REST.'
        : 'El proyecto no tiene ninguna variable de Redis; la base no quedó conectada a ESTE proyecto.')
    );
    err.sinCredenciales = true;
    throw err;
  }
  const r = await fetch(c.url.replace(/\/+$/, ''), {
    method: 'POST',
    headers: { Authorization: `Bearer ${c.token}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(cmd)
  });
  const txt = await r.text();
  if (!r.ok) throw new Error(`Redis (${c.via}) respondió ${r.status}: ${txt.slice(0, 160)}`);
  let j;
  try { j = JSON.parse(txt); } catch (e) { throw new Error('Respuesta ilegible de Redis: ' + txt.slice(0, 160)); }
  if (j.error) throw new Error('Redis: ' + j.error);
  return j.result;
}
