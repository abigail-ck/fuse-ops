/* /api/estado — diagnóstico. Dice si el servidor encontró credenciales y si
   Redis responde. Nunca devuelve valores secretos, solo nombres de variables. */

import { credenciales, variablesVisibles, redis } from './_redis.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  const c = credenciales();
  const salida = {
    credencialesEncontradas: !!c,
    variableUsada: c ? c.via : null,
    hostRedis: c ? String(c.url).replace(/^https?:\/\//, '').split('/')[0] : null,
    variablesDetectadas: variablesVisibles(),
    redisResponde: false,
    detalle: null
  };
  if (!c) {
    salida.detalle = salida.variablesDetectadas.length
      ? 'Hay variables relacionadas, pero ninguna sirve como credencial REST. Revisa que la base sea Upstash for Redis y esté conectada a ESTE proyecto.'
      : 'El proyecto no tiene ninguna variable de Redis: la base no quedó conectada a este proyecto, o falta redesplegar después de conectarla.';
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
