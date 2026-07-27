/* Capa de acceso a Redis que funciona con las dos formas en que Vercel puede
   entregar la base:
     · REST (Upstash): variables *_REST_URL / *_REST_TOKEN → se habla por HTTP.
     · TCP (Redis Cloud y otros): una URL redis:// o rediss:// → se habla con
       el cliente oficial de Redis.
   Así no importa qué proveedor se haya elegido en el Marketplace.            */

let clientePromesa = null;

/* ---------- descubrimiento de credenciales ---------- */
export function credenciales() {
  const e = process.env;

  // 1) REST con nombres conocidos
  const pares = [
    ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN'],
    ['KV_REST_API_URL', 'KV_REST_API_TOKEN'],
    ['REDIS_REST_API_URL', 'REDIS_REST_API_TOKEN'],
    ['STORAGE_REST_API_URL', 'STORAGE_REST_API_TOKEN']
  ];
  for (const [u, t] of pares) if (e[u] && e[t]) return { modo: 'rest', url: e[u], token: e[t], via: u };

  // 2) REST con cualquier otro nombre
  for (const k of Object.keys(e)) {
    if (/REST_(API_)?URL$/.test(k) && /^https:\/\//.test(e[k] || '')) {
      const tk = k.replace(/URL$/, 'TOKEN');
      if (e[tk]) return { modo: 'rest', url: e[k], token: e[tk], via: k };
    }
  }

  // 3) TCP: cualquier variable con una URL redis:// o rediss://
  const preferidas = ['REDIS_URL', 'KV_URL', 'STORAGE_URL', 'DATABASE_URL'];
  for (const k of preferidas) if (/^rediss?:\/\//.test(e[k] || '')) return { modo: 'tcp', url: e[k], via: k };
  for (const k of Object.keys(e)) if (/^rediss?:\/\//.test(e[k] || '')) return { modo: 'tcp', url: e[k], via: k };

  return null;
}

export function variablesVisibles() {
  return Object.keys(process.env).filter(k => /REDIS|KV_|UPSTASH|STORAGE/i.test(k)).sort();
}

/* ---------- cliente TCP reutilizado entre invocaciones ---------- */
async function clienteTcp(url) {
  if (clientePromesa) {
    try {
      const c = await clientePromesa;
      if (c.isOpen) return c;
    } catch (e) { /* se reintenta abajo */ }
    clientePromesa = null;
  }
  clientePromesa = (async () => {
    const { createClient } = await import('redis');
    const c = createClient({ url, socket: { connectTimeout: 10000, reconnectStrategy: r => (r > 3 ? false : 300) } });
    c.on('error', () => { /* se maneja en cada comando */ });
    await c.connect();
    return c;
  })();
  try {
    return await clientePromesa;
  } catch (e) {
    clientePromesa = null;
    throw e;
  }
}

/* ---------- comando único para toda la app ---------- */
export async function redis(cmd) {
  const c = credenciales();
  if (!c) {
    const vistas = variablesVisibles();
    const err = new Error(
      'Falta conectar la base de datos en Vercel (Storage → Create Database → Connect Project → Redeploy). ' +
      (vistas.length ? 'Variables detectadas: ' + vistas.join(', ') + '.' : 'El proyecto no tiene ninguna variable de Redis.')
    );
    err.sinCredenciales = true;
    throw err;
  }

  if (c.modo === 'tcp') {
    const cliente = await clienteTcp(c.url);
    return await cliente.sendCommand(cmd.map(String));
  }

  const r = await fetch(String(c.url).replace(/\/+$/, ''), {
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
