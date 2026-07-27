/* /api/estado — diagnóstico. Nunca devuelve secretos, solo nombres y host. */

import { credenciales, variablesVisibles, redis } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const c = credenciales();
  const salida = {
    credencialesEncontradas: !!c,
    conexion: c ? (c.modo === 'tcp' ? 'TCP (cliente Redis)' : 'REST (HTTP)') : null,
    variableUsada: c ? c.via : null,
    hostRedis: c ? String(c.url).replace(/^\w+:\/\/[^@]*@?/, '').split(/[:/]/)[0] : null,
    variablesDetectadas: variablesVisibles(),
    redisResponde: false,
    detalle: null
  };
  if (!c) {
    salida.detalle = 'No hay credenciales. Conecta una base en Storage y vuelve a desplegar.';
    return res.status(200).json(salida);
  }
  try {
    const pong = await redis(['PING']);
    salida.redisResponde = pong === 'PONG' || !!pong;
    salida.detalle = salida.redisResponde ? 'Todo listo: la base compartida está operativa.' : 'Redis contestó algo inesperado.';
  } catch (e) {
    salida.detalle = String(e.message || e);
  }
  return res.status(200).json(salida);
}
