import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

const YUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)'

// Dev-only: lets stock charts + fundamentals work in the browser at localhost:5173.
// In the installed APK these go direct to Yahoo via CapacitorHttp (no CORS), so this
// proxy is never bundled into production — it exists purely so we can preview on the web.
function yahooDevProxy() {
  return {
    name: 'yahoo-dev-proxy',
    configureServer(server) {
      // Fundamentals need Yahoo's cookie+crumb handshake — do it server-side and return the JSON.
      server.middlewares.use('/yahoo-fundamentals', async (req, res) => {
        try {
          const symbol = new URL(req.url, 'http://x').searchParams.get('symbol')
          const c = await fetch('https://fc.yahoo.com', { headers: { 'User-Agent': YUA } })
          const cookie = (c.headers.get('set-cookie') || '').split(';')[0]
          const crumb = (await (await fetch('https://query1.finance.yahoo.com/v1/test/getcrumb', { headers: { 'User-Agent': YUA, cookie } })).text()).trim()
          const mods = 'summaryDetail,defaultKeyStatistics,financialData,price,assetProfile'
          const r = await fetch(`https://query1.finance.yahoo.com/v10/finance/quoteSummary/${encodeURIComponent(symbol)}?modules=${mods}&crumb=${encodeURIComponent(crumb)}`, { headers: { 'User-Agent': YUA, cookie } })
          res.setHeader('content-type', 'application/json')
          res.end(await r.text())
        } catch (e) { res.statusCode = 502; res.end(JSON.stringify({ error: String(e) })) }
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), yahooDevProxy()],
  build: {
    outDir: 'dist',
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ['react', 'react-dom'],
          charts: ['recharts'],
        },
      },
    },
  },
  server: {
    port: 5173,
    host: true,
    // Chart / quote / search / metal endpoints need no auth — a plain proxy dodges CORS.
    proxy: {
      '/yfin': {
        target: 'https://query1.finance.yahoo.com',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/yfin/, ''),
        headers: { 'User-Agent': YUA },
      },
    },
  },
})
