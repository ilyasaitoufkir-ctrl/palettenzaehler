// Prüft, dass keine geheimen Schlüssel im Frontend Bundle gelandet sind.
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

const MUSTER = [/ANTHROPIC_API_KEY/, /sk-ant-[A-Za-z0-9_-]{10,}/, /FIREBASE_SERVICE_ACCOUNT/, /-----BEGIN PRIVATE KEY-----/, /private_key/]
const dateien = []
const laufen = (d) => {
  for (const f of readdirSync(d)) {
    const p = join(d, f)
    statSync(p).isDirectory() ? laufen(p) : dateien.push(p)
  }
}
laufen('dist')
const treffer = []
for (const f of dateien) {
  if (!/\.(js|html|css|json|webmanifest|txt)$/.test(f)) continue
  const s = readFileSync(f, 'utf8')
  for (const m of MUSTER) if (m.test(s)) treffer.push(`${f}: ${m}`)
}
if (treffer.length) {
  console.error('Geheimnisse im Bundle gefunden:\n' + treffer.join('\n'))
  process.exit(1)
}
console.log(`Bundle sauber: ${dateien.length} Dateien geprüft, keine Schlüssel gefunden.`)
