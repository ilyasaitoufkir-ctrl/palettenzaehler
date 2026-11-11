/**
 * POST /api/analyze
 * Nimmt bis zu drei Palettenfotos plus kompakten Artikelstamm entgegen,
 * prüft das Firebase ID Token und lässt die Bilder von Claude (Vision) auswerten.
 * Der API Schlüssel liegt ausschließlich serverseitig in ANTHROPIC_API_KEY.
 */
import { timingSafeEqual } from 'node:crypto'
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

/** Zeitkonstanter Vergleich, damit der Code nicht über Antwortzeiten erraten werden kann */
function gleich(a: string, b: string): boolean {
  const x = Buffer.from(a)
  const y = Buffer.from(b)
  return x.length === y.length && timingSafeEqual(x, y)
}

async function tokenPruefen(token: string): Promise<string> {
  // Variante ohne Firebase: gemeinsamer Zugangscode aus APP_ZUGANGSCODE
  if (token.startsWith('code:')) {
    const soll = process.env.APP_ZUGANGSCODE
    if (!soll) throw new HttpFehler(500, 'Server nicht konfiguriert (APP_ZUGANGSCODE fehlt).')
    if (soll.length < 8) throw new HttpFehler(500, 'APP_ZUGANGSCODE ist zu kurz (mindestens 8 Zeichen).')
    if (!gleich(token.slice(5), soll)) throw new HttpFehler(401, 'Zugangscode ist falsch.')
    return 'code'
  }
  const app = admin()
  const decoded = await getAuth(app).verifyIdToken(token)
  const profil = await getFirestore(app).collection('users').doc(decoded.uid).get()
  if (!profil.exists) throw new HttpFehler(403, 'Dieses Konto ist noch nicht freigeschaltet.')
  return decoded.uid
}

/** JSON Schema für strukturierte Ausgabe: die API erzwingt damit gültiges JSON */
const ANTWORT_SCHEMA = {
  type: 'object',
  properties: {
    artikel_match: { type: ['string', 'null'] },
    beschreibung: { type: 'string' },
    gebindeart: { type: 'string' },
    etikett_text: { type: ['string', 'null'] },
    stueck_pro_lage: { type: ['integer', 'null'] },
    lagen: { type: ['integer', 'null'] },
    fehlende_stueck: { type: 'integer' },
    gesamt_geschaetzt: { type: 'integer' },
    konfidenz: { type: 'string', enum: ['hoch', 'mittel', 'niedrig'] },
    hinweise: { type: 'string' },
  },
  required: ['artikel_match', 'beschreibung', 'gebindeart', 'etikett_text', 'stueck_pro_lage', 'lagen', 'fehlende_stueck', 'gesamt_geschaetzt', 'konfidenz', 'hinweise'],
  additionalProperties: false,
}

let strukturiertMoeglich = true

async function modellAufrufen(system: string, nachrichten: ModellNachricht[]): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY
  if (!key) throw new HttpFehler(500, 'Server nicht konfiguriert (ANTHROPIC_API_KEY fehlt).')
  const modell = process.env.ANTHROPIC_MODEL || 'claude-sonnet-5-5'

  const senden = (strukturiert: boolean) =>
    fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: modell,
        max_tokens: 4000,
        system,
        messages: nachrichten,
        ...(strukturiert ? { output_config: { format: { type: 'json_schema', schema: ANTWORT_SCHEMA } } } : {}),
      }),
      signal: AbortSignal.timeout(55_000),
    })

  let res = await senden(strukturiertMoeglich)
  if (res.status === 400 && strukturiertMoeglich) {
    // falls Modell oder API Version die strukturierte Ausgabe nicht annimmt: ohne erneut versuchen
    console.error('Strukturierte Ausgabe abgelehnt, versuche ohne:', (await res.text().catch(() => '')).slice(0, 300))
    strukturiertMoeglich = false
    res = await senden(false)
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    console.error('Anthropic API Fehler', res.status, detail.slice(0, 300))
    if (res.status === 401) throw new HttpFehler(502, 'Der Anthropic API Schlüssel ist ungültig. Bitte in Vercel prüfen.')
    if (res.status === 404) throw new HttpFehler(502, 'Das eingestellte KI Modell gibt es nicht. Bitte ANTHROPIC_MODEL in Vercel prüfen.')
    if (res.status === 429 || res.status === 529) throw new HttpFehler(503, 'Die KI ist gerade ausgelastet. Bitte gleich erneut versuchen.')
    if (res.status === 402 || /credit|balance/i.test(detail)) throw new HttpFehler(502, 'Kein Guthaben mehr bei Anthropic. Bitte in der Anthropic Konsole aufladen.')
    throw new HttpFehler(502, 'Die KI ist nicht erreichbar. Bitte erneut versuchen oder manuell erfassen.')
  }
  const data = (await res.json()) as { content?: { type: string; text?: string }[]; stop_reason?: string }
  const text = (data.content ?? [])
    .filter((c) => c.type === 'text')
    .map((c) => c.text ?? '')
    .join('')
  if (!text) console.error('Leere KI Antwort', data.stop_reason, (data.content ?? []).map((c) => c.type).join(','))
  if (data.stop_reason === 'refusal') throw new HttpFehler(502, 'Die KI hat die Analyse dieses Fotos abgelehnt. Bitte manuell erfassen.')
  return text
}

export const POST = createAnalyseHandler({ tokenPruefen, modellAufrufen })
