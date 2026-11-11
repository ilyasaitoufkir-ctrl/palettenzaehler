/**
 * POST /api/analyze
 * Nimmt bis zu drei Palettenfotos plus kompakten Artikelstamm entgegen,
 * prüft das Firebase ID Token und lässt die Bilder von Claude (Vision) auswerten.
 * Der API Schlüssel liegt ausschließlich serverseitig in ANTHROPIC_API_KEY.
 */
import { cert, getApps, initializeApp, type App } from 'firebase-admin/app'
import { getAuth } from 'firebase-admin/auth'
import { getFirestore } from 'firebase-admin/firestore'
import { HttpFehler, createAnalyseHandler, type ModellNachricht } from './_lib/handler.js'

export const config = { maxDuration: 60 }

let adminApp: App | null = null
function admin(): App {
  if (adminApp) return adminApp
  const roh = process.env.FIREBASE_SERVICE_ACCOUNT_JSON
  if (!roh) throw new HttpFehler(500, 'Server nicht konfiguriert (FIREBASE_SERVICE_ACCOUNT_JSON fehlt).')
  let konto: { project_id: string; client_email: string; private_key: string }
  try {
    konto = JSON.parse(roh)
  } catch {
    throw new HttpFehler(500, 'Server nicht konfiguriert (FIREBASE_SERVICE_ACCOUNT_JSON ist kein gültiges JSON).')
  }
  adminApp =
    getApps()[0] ??
    initializeApp({
      credential: cert({
        projectId: konto.project_id,
        clientEmail: konto.client_email,
        privateKey: konto.private_key.replace(/\\n/g, '\n'),
      }),
    })
  return adminApp
}

async function tokenPruefen(token: string): Promise<string> {
  const app = admin()
  const decoded = await getAuth(app).verifyIdToken(token)
  const profil = await getFirestore(app).collection('users').doc(decoded.uid).get()
  if (!profil.exists) throw new HttpFehler(403, 'Dieses Konto ist noch nicht freigeschaltet.')
  return decoded.uid
}

async function modellAufrufen(system: string, nachrichten: ModellNachricht[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new HttpFehler(500, 'Server nicht konfiguriert (ANTHROPIC_API_KEY fehlt).')
  const modell = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({ model: modell, max_tokens: 1200, system, messages: nachrichten }),
    signal: AbortSignal.timeout(50_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('Anthropic API Fehler', res.status, detail.slice(0, 300))
    if (res.status === 429 || res.status === 529) throw new HttpFehler(503, 'Die KI ist gerade ausgelastet. Bitte gleich erneut versuchen.')
    throw new HttpFehler(502, 'Die KI ist nicht erreichbar. Bitte erneut versuchen oder manuell erfassen.')
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[] }
  return (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
}

export const POST = createAnalyseHandler({ tokenPruefen, modellAufrufen })
