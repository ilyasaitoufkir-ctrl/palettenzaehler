import { z } from 'zod'

/** Vercel Functions akzeptieren höchstens 4,5 MB Request Body, wir bleiben mit Puffer darunter. */
export const MAX_REQUEST_BYTES = 4_400_000
export const MAX_BILDER = 3
export const MAX_BILD_BYTES = 1_500_000
export const MAX_ARTIKEL = 800

export const ERLAUBTE_BILDTYPEN = ['image/jpeg', 'image/png', 'image/webp'] as const

const base64 = z.string().regex(/^[A-Za-z0-9+/]+={0,2}$/, 'Bilddaten sind kein gültiges Base64')

export const AnalyseAnfrageSchema = z.object({
  bilder: z
    .array(
      z.object({
        mediaType: z.enum(ERLAUBTE_BILDTYPEN),
        daten: base64,
      }),
    )
    .min(1, 'Mindestens ein Bild wird benötigt')
    .max(MAX_BILDER, `Maximal ${MAX_BILDER} Bilder pro Anfrage`),
  artikel: z
    .array(
      z.object({
        nr: z.string().trim().min(1).max(64),
        bez: z.string().trim().max(160),
        gebinde: z.string().trim().max(80).optional().default(''),
        stueckProLage: z.number().int().min(0).max(10_000).nullable().optional().default(null),
        barcode: z.string().trim().max(64).nullable().optional().default(null),
      }),
    )
    .max(MAX_ARTIKEL)
    .default([]),
})
export type AnalyseAnfrage = z.infer<typeof AnalyseAnfrageSchema>

const ganzeZahlOderNull = z.number().int().min(0).max(100_000).nullable()

export const KiErgebnisSchema = z
  .object({
    artikel_match: z.string().trim().max(64).nullable(),
    beschreibung: z.string().max(600),
    gebindeart: z.string().max(120),
    etikett_text: z.string().max(600).nullable(),
    produkt: z.string().max(160).optional().default(''),
    paletten_nummer: z.string().max(64).nullable().optional().default(null),
    barcode_nummern: z.array(z.string().max(64)).max(10).optional().default([]),
    charge: z.string().max(64).nullable().optional().default(null),
    stueck_pro_lage: ganzeZahlOderNull,
    lagen: ganzeZahlOderNull,
    fehlende_stueck: z.number().int().min(0).max(100_000),
    gesamt_geschaetzt: z.number().int().min(0).max(1_000_000),
    konfidenz: z.enum(['hoch', 'mittel', 'niedrig']),
    hinweise: z.string().max(1200),
  })
export type KiErgebnisRoh = z.infer<typeof KiErgebnisSchema>

/** Prüft die Magic Bytes, damit nur echte Bilder an die KI gehen */
export function bildSignaturPasst(mediaType: (typeof ERLAUBTE_BILDTYPEN)[number], buf: Uint8Array): boolean {
  if (mediaType === 'image/jpeg') return buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff
  if (mediaType === 'image/png') return buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47
  return (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46 && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  )
}

export function base64Bytes(b64: string): number {
  const pad = b64.endsWith('==') ? 2 : b64.endsWith('=') ? 1 : 0
  return Math.floor((b64.length * 3) / 4) - pad
}

export const SYSTEM_PROMPT = `Du bist ein präziser Assistent für industrielle Paletteninventuren.

Analysiere ausschließlich die tatsächlich sichtbaren Informationen der bereitgestellten Bilder.

WICHTIGE REGELN:
- Zähle nur Gebinde, die anhand der Bilder nachvollziehbar erkennbar sind.
- Unterscheide strikt zwischen Lagen und Stück pro Lage.
- Berücksichtige angebrochene oder unvollständige Paletten.
- Erkenne, wenn Gebinde durch Folie, andere Paletten oder Perspektive verdeckt sind.
- Benenne verdeckte Bereiche ausdrücklich.
- Erfinde keine Artikelnummern.
- Ordne Artikel nur dann zu, wenn eine nachvollziehbare Übereinstimmung mit dem Artikelstamm besteht.
- Wenn kein Gebinde zuverlässig erkennbar ist, rate nicht.
- Setze die Konfidenz auf niedrig, wenn wesentliche Informationen unsicher sind.
- Unterscheide zwischen sichtbarer Menge und geschätzter Gesamtmenge.
- Lies Etiketten genau: Produktname (z. B. "Chlor flüssig") gehört in produkt, kurz und so wie auf dem Etikett.
- Lies Palettennummern (Palettenschein, NVE/SSCC, Lagerplatz Etikett) und Ziffern unter Barcodes oder QR Codes Zeichen für Zeichen ab. Nur übernehmen, was eindeutig lesbar ist, nichts ergänzen oder raten.
- Chargen oder Losnummern (Charge, Lot, LOT, Ch.-B.) gehören in charge.
- Wenn eine gelesene Barcode Nummer oder Artikelnummer im Artikelstamm vorkommt, setze artikel_match auf diese Artikelnummer.
- Gib keine scheinbar exakten Zahlen aus, wenn die Bilder keine zuverlässige Zählung erlauben.

Antworte ausschließlich mit einem JSON-Objekt nach dem vorgegebenen Schema, ohne Markdown und ohne weiteren Text.
Auch wenn das Bild unscharf ist, keine Palette zeigt oder du nichts zählen kannst, antworte mit diesem JSON: dann lagen und stueck_pro_lage null, gesamt_geschaetzt 0, konfidenz "niedrig" und den Grund in hinweise.`

const SCHEMA_TEXT = `{
  "artikel_match": "Artikelnummer aus dem Artikelstamm oder null",
  "beschreibung": "kurze Beschreibung dessen, was auf der Palette steht",
  "gebindeart": "z. B. Kanister 25 l, Karton, Fass, IBC",
  "etikett_text": "weiterer gelesener Etikettentext oder null",
  "produkt": "Produktname laut Etikett, z. B. Chlor flüssig, sonst leer",
  "paletten_nummer": "abgelesene Palettennummer oder NVE/SSCC oder null",
  "barcode_nummern": ["abgelesene Ziffern unter Barcodes, sonst leere Liste"],
  "charge": "Charge/Lot oder null",
  "stueck_pro_lage": "ganze Zahl oder null",
  "lagen": "ganze Zahl oder null",
  "fehlende_stueck": "ganze Zahl ab 0 (fehlende Gebinde in angebrochenen Lagen)",
  "gesamt_geschaetzt": "ganze Zahl ab 0",
  "konfidenz": "hoch | mittel | niedrig",
  "hinweise": "Unsicherheiten, verdeckte Bereiche, Auffälligkeiten"
}`

export function nutzerText(artikel: AnalyseAnfrage['artikel']): string {
  const stamm = artikel.length
    ? artikel.map((a) => `${a.nr} | ${a.bez} | ${a.gebinde || '-'} | Stück pro Lage: ${a.stueckProLage ?? '-'} | Barcode: ${a.barcode || '-'}`).join('\n')
    : '(kein Artikelstamm hinterlegt, artikel_match muss null sein)'
  return `Analysiere die Palette auf den Bildern (Front, Seite und/oder Draufsicht derselben Palette).

ARTIKELSTAMM (Artikelnummer | Bezeichnung | Gebinde | Stück pro Lage | Barcode):
${stamm}

Antworte nur mit JSON nach diesem Schema:
${SCHEMA_TEXT}`
}

/** Holt das erste JSON Objekt aus einer Modellantwort, auch wenn es in Markdown eingebettet ist */
export function jsonExtrahieren(text: string): unknown {
  const ohneZaun = text.replace(/```(?:json)?/gi, '').trim()
  const start = ohneZaun.indexOf('{')
  const ende = ohneZaun.lastIndexOf('}')
  if (start < 0 || ende <= start) throw new Error('Keine JSON Struktur in der Antwort gefunden')
  return JSON.parse(ohneZaun.slice(start, ende + 1))
}

const KONFIDENZ_ALIAS: Record<string, 'hoch' | 'mittel' | 'niedrig'> = {
  hoch: 'hoch', high: 'hoch', gut: 'hoch',
  mittel: 'mittel', medium: 'mittel', mittelmäßig: 'mittel',
  niedrig: 'niedrig', low: 'niedrig', gering: 'niedrig', unsicher: 'niedrig',
}

function zahl(v: unknown): unknown {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'string') {
    const n = Number(v.trim().replace(',', '.'))
    return Number.isFinite(n) ? zahl(n) : v
  }
  if (typeof v === 'number' && Number.isFinite(v) && !Number.isInteger(v)) return Math.round(v)
  return v
}

/**
 * Bringt kleine Formabweichungen des Modells in das Schema (Zahl als Text, englische Konfidenz,
 * fehlende Pflichtzahlen). Echte Unsinnswerte (negativ, Text statt Zahl) bleiben ungültig.
 */
export function kiAntwortNormalisieren(roh: unknown): unknown {
  if (!roh || typeof roh !== 'object' || Array.isArray(roh)) return roh
  const o = { ...(roh as Record<string, unknown>) }
  for (const k of ['stueck_pro_lage', 'lagen', 'fehlende_stueck', 'gesamt_geschaetzt']) o[k] = zahl(o[k])
  if (o.fehlende_stueck === null) o.fehlende_stueck = 0
  if (o.gesamt_geschaetzt === null) {
    const l = typeof o.lagen === 'number' ? o.lagen : null
    const s = typeof o.stueck_pro_lage === 'number' ? o.stueck_pro_lage : null
    const f = typeof o.fehlende_stueck === 'number' ? o.fehlende_stueck : 0
    o.gesamt_geschaetzt = l !== null && s !== null ? Math.max(0, l * s - f) : 0
  }
  if (typeof o.konfidenz === 'string') o.konfidenz = KONFIDENZ_ALIAS[o.konfidenz.trim().toLowerCase()] ?? o.konfidenz
  for (const k of ['beschreibung', 'gebindeart', 'hinweise']) if (o[k] === null || o[k] === undefined) o[k] = ''
  for (const k of ['beschreibung', 'gebindeart', 'hinweise', 'etikett_text']) if (typeof o[k] === 'string') o[k] = (o[k] as string).slice(0, k === 'hinweise' ? 1200 : 600)
  if (o.etikett_text === undefined || o.etikett_text === '') o.etikett_text = null
  for (const k of ['paletten_nummer', 'charge']) {
    if (typeof o[k] === 'number') o[k] = String(o[k])
    if (o[k] === '' || o[k] === undefined) o[k] = null
    if (typeof o[k] === 'string') o[k] = (o[k] as string).trim().slice(0, 64) || null
  }
  if (o.produkt === null || o.produkt === undefined) o.produkt = ''
  if (typeof o.produkt === 'string') o.produkt = o.produkt.trim().slice(0, 160)
  if (typeof o.barcode_nummern === 'string') o.barcode_nummern = [o.barcode_nummern]
  if (Array.isArray(o.barcode_nummern))
    o.barcode_nummern = Array.from(new Set(o.barcode_nummern.map((x) => String(x).replace(/\s+/g, '').slice(0, 64)).filter(Boolean))).slice(0, 10)
  else o.barcode_nummern = []
  if (o.artikel_match === undefined || o.artikel_match === '') o.artikel_match = null
  if (typeof o.artikel_match === 'number') o.artikel_match = String(o.artikel_match)
  return o
}

export type ValidierungsErgebnis =
  | { ok: true; ergebnis: KiErgebnisRoh }
  | { ok: false; fehler: string }

/**
 * KI Ausgaben gelten als unzuverlässige externe Eingabe:
 * JSON prüfen, Schema prüfen, Artikelnummer gegen den Stamm abgleichen.
 */
export interface StammEintrag {
  nr: string
  barcode?: string | null
}

export function kiAntwortValidieren(text: string, stammRoh: (string | StammEintrag)[]): ValidierungsErgebnis {
  const stamm: StammEintrag[] = stammRoh.map((x) => (typeof x === 'string' ? { nr: x } : x))
  const nummern = stamm.map((a) => a.nr)
  let roh: unknown
  try {
    roh = jsonExtrahieren(text)
  } catch (e) {
    return { ok: false, fehler: `Ungültiges JSON: ${(e as Error).message}` }
  }
  const p = KiErgebnisSchema.safeParse(kiAntwortNormalisieren(roh))
  if (!p.success) {
    const details = p.error.issues.map((i) => `${i.path.join('.') || 'Objekt'}: ${i.message}`).join('; ')
    return { ok: false, fehler: `Schema verletzt: ${details}` }
  }
  const e = { ...p.data }
  const hinweis = (t: string) => (e.hinweise = [e.hinweise, t].filter(Boolean).join(' '))
  if (e.artikel_match !== null) {
    const nr = e.artikel_match.trim()
    if (!nummern.includes(nr)) {
      hinweis(`Die genannte Artikelnummer "${nr}" ist nicht im Artikelstamm und wurde verworfen.`)
      e.artikel_match = null
      if (e.konfidenz === 'hoch') e.konfidenz = 'mittel'
    } else e.artikel_match = nr
  }
  // abgelesene Barcode Nummern mit dem Stamm abgleichen (Barcode oder Artikelnummer)
  if (e.artikel_match === null && e.barcode_nummern.length) {
    const norm = (s: string) => s.replace(/\s+/g, '')
    const treffer = stamm.find((a) => e.barcode_nummern.some((b) => norm(b) === norm(a.barcode ?? '') || norm(b) === norm(a.nr)))
    if (treffer) {
      e.artikel_match = treffer.nr
      hinweis(`Artikel über abgelesene Nummer zugeordnet.`)
    }
  }
  return { ok: true, ergebnis: e }
}
