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
    stueck_pro_lage: ganzeZahlOderNull,
    lagen: ganzeZahlOderNull,
    fehlende_stueck: z.number().int().min(0).max(100_000),
    gesamt_geschaetzt: z.number().int().min(0).max(1_000_000),
    konfidenz: z.enum(['hoch', 'mittel', 'niedrig']),
    hinweise: z.string().max(1200),
  })
  .strict()
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
- Gib keine scheinbar exakten Zahlen aus, wenn die Bilder keine zuverlässige Zählung erlauben.

Antworte ausschließlich mit einem JSON-Objekt nach dem vorgegebenen Schema, ohne Markdown und ohne weiteren Text.`

const SCHEMA_TEXT = `{
  "artikel_match": "Artikelnummer aus dem Artikelstamm oder null",
  "beschreibung": "kurze Beschreibung dessen, was auf der Palette steht",
  "gebindeart": "z. B. Kanister 25 l, Karton, Fass, IBC",
  "etikett_text": "gelesener Etikett oder Chargentext oder null",
  "stueck_pro_lage": "ganze Zahl oder null",
  "lagen": "ganze Zahl oder null",
  "fehlende_stueck": "ganze Zahl ab 0 (fehlende Gebinde in angebrochenen Lagen)",
  "gesamt_geschaetzt": "ganze Zahl ab 0",
  "konfidenz": "hoch | mittel | niedrig",
  "hinweise": "Unsicherheiten, verdeckte Bereiche, Auffälligkeiten"
}`

export function nutzerText(artikel: AnalyseAnfrage['artikel']): string {
  const stamm = artikel.length
    ? artikel.map((a) => `${a.nr} | ${a.bez} | ${a.gebinde || '-'} | Stück pro Lage: ${a.stueckProLage ?? '-'}`).join('\n')
    : '(kein Artikelstamm hinterlegt, artikel_match muss null sein)'
  return `Analysiere die Palette auf den Bildern (Front, Seite und/oder Draufsicht derselben Palette).

ARTIKELSTAMM (Artikelnummer | Bezeichnung | Gebinde | Stück pro Lage):
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

export type ValidierungsErgebnis =
  | { ok: true; ergebnis: KiErgebnisRoh }
  | { ok: false; fehler: string }

/**
 * KI Ausgaben gelten als unzuverlässige externe Eingabe:
 * JSON prüfen, Schema prüfen, Artikelnummer gegen den Stamm abgleichen.
 */
export function kiAntwortValidieren(text: string, stammNummern: string[]): ValidierungsErgebnis {
  let roh: unknown
  try {
    roh = jsonExtrahieren(text)
  } catch (e) {
    return { ok: false, fehler: `Ungültiges JSON: ${(e as Error).message}` }
  }
  const p = KiErgebnisSchema.safeParse(roh)
  if (!p.success) {
    const details = p.error.issues.map((i) => `${i.path.join('.') || 'Objekt'}: ${i.message}`).join('; ')
    return { ok: false, fehler: `Schema verletzt: ${details}` }
  }
  const e = { ...p.data }
  if (e.artikel_match !== null) {
    const nr = e.artikel_match.trim()
    if (!stammNummern.includes(nr)) {
      e.hinweise = [e.hinweise, `Die genannte Artikelnummer "${nr}" ist nicht im Artikelstamm und wurde verworfen.`]
        .filter(Boolean)
        .join(' ')
      e.artikel_match = null
      if (e.konfidenz === 'hoch') e.konfidenz = 'mittel'
    } else e.artikel_match = nr
  }
  return { ok: true, ergebnis: e }
}
