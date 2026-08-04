// FUSE OPS · api/ia.js
// Puente seguro hacia la API de Anthropic (Claude).
// La clave vive SOLO aquí, como variable de entorno de Vercel (ANTHROPIC_API_KEY);
// el navegador nunca la ve. Modelo configurable con IA_MODELO (opcional).

export default async function handler(req, res) {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'metodo', detalle: 'Solo POST.' });
  }

  const clave = process.env.ANTHROPIC_API_KEY;
  if (!clave) {
    return res.status(503).json({
      error: 'sin_clave',
      detalle: 'Falta la variable ANTHROPIC_API_KEY en Vercel (Settings → Environment Variables) y redesplegar.'
    });
  }

  try {
    const { sistema, mensajes } = req.body || {};
    if (!Array.isArray(mensajes) || !mensajes.length) {
      return res.status(400).json({ error: 'sin_mensajes', detalle: 'No llegó ninguna pregunta.' });
    }

    // Se recortan historial y tamaños para mantener el costo y la latencia a raya.
    const cuerpo = {
      model: process.env.IA_MODELO || 'claude-haiku-4-5',
      max_tokens: 1024,
      system: String(sistema || '').slice(0, 180000),
      messages: mensajes.slice(-16).map(m => ({
        role: m.role === 'assistant' ? 'assistant' : 'user',
        content: String(m.content || '').slice(0, 8000)
      }))
    };

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': clave,
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify(cuerpo)
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) {
      const detalle = (j && j.error && j.error.message) || ('HTTP ' + r.status);
      // 401 = clave inválida; 400 con "credit" = sin saldo. Se devuelve el detalle tal cual.
      return res.status(502).json({ error: 'api', detalle });
    }

    const texto = (j.content || [])
      .filter(b => b && b.type === 'text')
      .map(b => b.text)
      .join('\n')
      .trim();

    return res.status(200).json({ texto });
  } catch (e) {
    return res.status(500).json({ error: 'interno', detalle: String((e && e.message) || e) });
  }
}
