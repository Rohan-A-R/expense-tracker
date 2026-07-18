// PIN hashing — SHA-256 when available (Capacitor WebView, https), FNV fallback
// for plain-http dev where crypto.subtle is unavailable.
export async function hashPin(pin) {
  const text = `expense-tracker:${pin}`
  if (globalThis.crypto?.subtle) {
    const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
    return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('')
  }
  let h1 = 0x811c9dc5, h2 = 0x01000193
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 0x01000193) >>> 0
    h2 = Math.imul(h2 ^ text.charCodeAt(text.length - 1 - i), 0x01000193) >>> 0
  }
  return `fnv-${h1.toString(16)}${h2.toString(16)}`
}
