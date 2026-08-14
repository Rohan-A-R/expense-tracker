// Finances — AI proxy (Cloudflare Worker)
// Holds the OpenRouter key server-side so the app ships with NO secret.
// The app POSTs { prompt, stream? } to this Worker; the Worker adds the key,
// calls OpenRouter, and returns either { text } (buffered) or an SSE token
// stream (when stream:true). Change MODEL below to swap models — no app change.
//
// Setup:
//   1. Paste this into a Cloudflare Worker.
//   2. Add a Secret named OPENROUTER_KEY (your sk-or-... key).
//   3. Deploy. Use the Worker URL in the app.
//
// Protection (no secret needed in the app):
//   - A hard spend cap set on the OpenRouter key (dashboard).
//   - Rate limiting per client IP (below, needs a KV namespace bound as RL).

const MODEL = 'openai/gpt-oss-20b:free'   // 21B MoE, free, 131K ctx — follows instructions reliably
const MAX_TOKENS = 600
const RATE_LIMIT = 40                       // max requests per IP per hour

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS })
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405)

    // Optional per-IP rate limit (active only if a KV namespace is bound as RL)
    if (env.RL) {
      const ip = request.headers.get('CF-Connecting-IP') || 'unknown'
      const key = `rl:${ip}:${new Date().toISOString().slice(0, 13)}` // per hour
      const n = Number(await env.RL.get(key)) || 0
      if (n >= RATE_LIMIT) return json({ error: 'rate limited' }, 429)
      await env.RL.put(key, String(n + 1), { expirationTtl: 3700 })
    }

    let body
    try { body = await request.json() } catch { return json({ error: 'bad json' }, 400) }
    const prompt = (body && body.prompt || '').toString().slice(0, 8000)
    const wantStream = !!(body && body.stream)
    if (!prompt) return json({ error: 'missing prompt' }, 400)

    const upstream = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: MODEL,
        max_tokens: MAX_TOKENS,
        stream: wantStream,
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    if (!upstream.ok) return json({ error: `upstream ${upstream.status}` }, 502)

    // Streaming: pipe OpenRouter's SSE straight through to the app.
    if (wantStream) {
      return new Response(upstream.body, {
        headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }

    // Buffered: return the finished text.
    const data = await upstream.json()
    const text = data?.choices?.[0]?.message?.content?.trim() || ''
    return json({ text })
  },
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
