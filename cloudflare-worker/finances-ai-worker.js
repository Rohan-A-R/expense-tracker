// Finances — AI proxy (Cloudflare Worker)
// Holds the OpenRouter key server-side so the app ships with NO secret.
// The app POSTs { prompt, stream?, task? } to this Worker; the Worker adds the key,
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

// One model for everything. 1M context (swallows a whole stock-research dump without
// trimming) and a far stronger reasoner than the small free models. FALLBACK is the
// same model's paid twin — used only when the free pool 429s, so it costs nothing
// until the free tier is actually exhausted.
// (The ':free' variant was withdrawn from OpenRouter in Sept 2026 — free slugs come and
// go without notice, which is why any upstream failure now falls through to FALLBACK.)
const MODEL = 'deepseek/deepseek-v4-flash-0731'
const FALLBACK = 'deepseek/deepseek-v4-flash'

// Chat and analysis differ only in size and output shape.
//   chat     — short Q&A about the user's own finances (Ask Finances / AI Recap)
//   analysis — a big research context in, structured JSON report out
// maxTokens must leave real headroom: this model *can* reason, and reasoning tokens are
// billed against the same budget. Too small a cap and it spends the lot thinking and
// returns empty content (a silent 200 with "" — looks like a hang, not an error).
// Reasoning is disabled below anyway, so these caps are for the answer itself.
const TASKS = {
  chat: { maxPrompt: 12000, maxTokens: 900, json: false },
  analysis: { maxPrompt: 60000, maxTokens: 4000, json: true },
}

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
    const cfg = TASKS[body && body.task] || TASKS.chat
    const prompt = (body && body.prompt || '').toString().slice(0, cfg.maxPrompt)
    const wantStream = !!(body && body.stream)
    if (!prompt) return json({ error: 'missing prompt' }, 400)

    const call = (model) => fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.OPENROUTER_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        max_tokens: cfg.maxTokens,
        stream: wantStream,
        // Reasoning OFF. Every figure is precomputed on-device, so there is nothing for
        // the model to work out — it only phrases and judges. Left on, it burns the token
        // budget thinking and can return empty content, and it makes replies far slower.
        reasoning: { enabled: false },
        // JSON mode keeps the report parseable instead of wrapped in prose/markdown.
        ...(cfg.json && !wantStream ? { response_format: { type: 'json_object' } } : {}),
        messages: [{ role: 'user', content: prompt }],
      }),
    })

    // Any upstream failure (throttle, model withdrawn/renamed, provider down) → try the
    // fallback model once rather than failing the user.
    let upstream = await call(MODEL)
    if (!upstream.ok && FALLBACK) {
      upstream = await call(FALLBACK)
    }

    if (!upstream.ok) return json({ error: `upstream ${upstream.status}` }, 502)

    // Streaming: pipe OpenRouter's SSE straight through to the app.
    if (wantStream) {
      return new Response(upstream.body, {
        headers: { ...CORS, 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      })
    }

    // Buffered: return the finished text.
    const data = await upstream.json()
    const choice = data?.choices?.[0]
    const text = choice?.message?.content?.trim() || ''
    // An empty 200 is worse than an error — the app retries blindly and looks frozen.
    // Report it, with the finish_reason so the cause is visible ("length" = cap too low).
    if (!text) {
      return json({ error: 'empty completion', finish: choice?.finish_reason || null }, 502)
    }
    return json({ text })
  },
}

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status, headers: { ...CORS, 'Content-Type': 'application/json' },
  })
}
