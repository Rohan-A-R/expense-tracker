const { Resvg } = require('@resvg/resvg-js')
const fs = require('fs')
const path = require('path')

const ROOT = path.resolve(__dirname, '..')
const full = fs.readFileSync(path.join(ROOT, 'public/icons/icon.svg'), 'utf8')
const fg = fs.readFileSync(path.join(ROOT, 'public/icons/icon-foreground.svg'), 'utf8')

function render(svg, size) {
  const r = new Resvg(svg, { font: { loadSystemFonts: true }, fitTo: { mode: 'width', value: size } })
  return r.render().asPng()
}
function write(p, buf) {
  fs.mkdirSync(path.dirname(p), { recursive: true })
  fs.writeFileSync(p, buf)
  console.log('  ', path.relative(ROOT, p), buf.length + 'b')
}

// --- Web / PWA ---
console.log('web:')
write(path.join(ROOT, 'public/icons/icon-192.png'), render(full, 192))
write(path.join(ROOT, 'public/icons/icon-512.png'), render(full, 512))
write(path.join(ROOT, 'public/favicon.png'), render(full, 64))

// --- Android ---
const RES = path.join(ROOT, 'android/app/src/main/res')
const legacy = { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 }
const adaptive = { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 }

console.log('android legacy (ic_launcher / ic_launcher_round):')
for (const [d, size] of Object.entries(legacy)) {
  const dir = path.join(RES, `mipmap-${d}`)
  write(path.join(dir, 'ic_launcher.png'), render(full, size))
  write(path.join(dir, 'ic_launcher_round.png'), render(full, size))
}

console.log('android adaptive foreground:')
for (const [d, size] of Object.entries(adaptive)) {
  write(path.join(RES, `mipmap-${d}`, 'ic_launcher_foreground.png'), render(fg, size))
}
console.log('done')
