// AI network layer — talks to the Cloudflare Worker proxy that holds the
// OpenRouter key server-side. The app ships with NO secret: only this public URL.
//
// Two entry points:
//   aiComplete(prompt)        — buffered, with silent auto-retry (used by the recap)
//   aiStream(prompt, onDelta) — token streaming for a live-typing feel, with retry
//                               and a graceful fall back to the buffered path
// Free models occasionally return empty or stall, so retry is what makes the
// experience feel reliable. To change the model, edit the Worker — no app change.
import { CapacitorHttp } from '@capacitor/core'

const WORKER_URL = 'https://throbbing-base-fd72.rohanflash27.workers.dev/'

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

// ---- Buffered call (CapacitorHttp: works native + web since the Worker is CORS-open) ----
async function completeOnce(prompt) {
  const res = await CapacitorHttp.post({
    url: WORKER_URL,
    headers: { 'Content-Type': 'application/json' },
    data: { prompt },
    connectTimeout: 15000,
    readTimeout: 30000,
  })
  if (res.status >= 400) throw new Error(`AI ${res.status}`)
  const d = typeof res.data === 'string' ? JSON.parse(res.data) : res.data
  const text = (d && d.text || '').trim()
  if (!text) throw new Error('Empty response')
  return text
}

// Buffered + auto-retry. Free models flake (empty / timeout) — retry hides most of it.
export async function aiComplete(prompt, { retries = 2 } = {}) {
  let lastErr
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await completeOnce(prompt) }
    catch (e) { lastErr = e; if (attempt < retries) await sleep(500 * (attempt + 1)) }
  }
  throw lastErr
}

// ---- Streaming call: reads OpenRouter's SSE via the Worker, calls onDelta(fullTextSoFar) ----
// Uses plain fetch (streaming ReadableStream) — supported in the browser preview and the
// Capacitor Android WebView (Chromium). Retries once, then falls back to the buffered path.
async function streamOnce(prompt, onDelta) {
  const resp = await fetch(WORKER_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt, stream: true }),
  })
  if (!resp.ok || !resp.body) throw new Error(`stream ${resp.status}`)

  const reader = resp.body.getReader()
  const decoder = new TextDecoder()
  let buf = '', full = ''
  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buf += decoder.decode(value, { stream: true })
    const lines = buf.split('\n')
    buf = lines.pop()                       // keep the last partial line
    for (const line of lines) {
      const t = line.trim()
      if (!t.startsWith('data:')) continue
      const payload = t.slice(5).trim()
      if (payload === '[DONE]') continue
      try {
        const j = JSON.parse(payload)
        const delta = j.choices?.[0]?.delta?.content || ''
        if (delta) { full += delta; onDelta(full) }
      } catch { /* ignore keep-alive / non-JSON lines */ }
    }
  }
  if (!full.trim()) throw new Error('Empty stream')
  return full.trim()
}

export async function aiStream(prompt, onDelta, { retries = 1 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try { return await streamOnce(prompt, onDelta) }
    catch { if (attempt < retries) await sleep(500) }
  }
  // Streaming failed entirely — fall back to the buffered (also-retrying) path.
  const text = await aiComplete(prompt)
  onDelta(text)
  return text
}
