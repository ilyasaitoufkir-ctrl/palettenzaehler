import type { Artikel, ErkennungsErgebnis, KiErgebnis } from '../../types'
import type { DataRepo } from '../../lib/data'
import { barcodesLesen, blobZuBase64 } from '../../lib/utils/bild'

export class ErkennungsFehler extends Error {
  constructor(
    message: string,
    /** true, wenn ein späterer Versuch sinnvoll ist (Netz, Auslastung) */
    public wiederholbar = true,
  ) {
    super(message)
  }
}

/**
 * Zentrale Schnittstelle der Erkennung. Weitere Verfahren (reiner Barcode Scan,
 * anderes Modell, Power Platform) lassen sich hier ergänzen, ohne die Oberfläche anzufassen.
 */
export type RecognizePallet = (bilder: Blob[], artikel: Artikel[]) => Promise<ErkennungsErgebnis>

export function artikelPerBarcode(werte: string[], artikel: Artikel[]): Artikel | null {
  for (const w of werte) {
    const t = artikel.find((a) => (a.barcode && a.barcode === w) || a.artikelnummer === w)
    if (t) return t
  }
  return null
}

async function barcodeTeil(bilder: Blob[], artikel: Artikel[]) {
  const werte = (await barcodesLesen(bilder)) ?? []
  return { barcodeWerte: werte, barcodeArtikelnummer: artikelPerBarcode(werte, artikel)?.artikelnummer ?? null }
}

/** Echte Erkennung über die serverseitige Funktion /api/analyze */
export function createApiRecognizer(repo: DataRepo): RecognizePallet {
  return async (bilder, artikel) => {
    if (!navigator.onLine) throw new ErkennungsFehler('Keine Verbindung. Die Analyse startet automatisch, sobald du wieder online bist.')
    const token = await repo.idToken()
    if (!token) throw new ErkennungsFehler('Bitte neu anmelden.', false)

    const [daten, barcode] = await Promise.all([
      Promise.all(bilder.slice(0, 3).map(async (b) => ({ mediaType: 'image/jpeg', daten: await blobZuBase64(b) }))),
      barcodeTeil(bilder, artikel),
    ])
    const body = JSON.stringify({
      bilder: daten,
      artikel: artikel.map((a) => ({
        nr: a.artikelnummer,
        bez: a.bezeichnung.slice(0, 160),
        gebinde: [a.gebindeart, a.gebindegroesse].filter(Boolean).join(' ').slice(0, 80),
        stueckProLage: a.stueckProLage,
        barcode: a.barcode,
      })),
    })

    let res: Response
    try {
      res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
        body,
      })
    } catch {
      throw new ErkennungsFehler('Server nicht erreichbar. Bitte erneut versuchen.')
    }
    const antwort = (await res.json().catch(() => ({}))) as { ergebnis?: KiErgebnis; fehler?: string; grund?: string }
    if (!res.ok || !antwort.ergebnis) {
      const dauerhaft = [400, 401, 403, 413, 415].includes(res.status)
      const text = (antwort.fehler ?? `Analyse fehlgeschlagen (${res.status}).`) + (antwort.grund ? ` (Grund: ${antwort.grund})` : '')
      throw new ErkennungsFehler(text, !dauerhaft)
    }
    return { ki: antwort.ergebnis, ...barcode }
  }
}


interface SampleFn {
  (input: string, opts?: { images?: Blob[]; modelTier?: 'quick' | 'default' | 'complex'; cache?: boolean; signal?: AbortSignal }): Promise<{ text: string }>
  limits(): Promise<{ images?: { maxCount: number; maxInputBytes: number } }>
}

/**
 * Echte Erkennung auf der veröffentlichten Claude Seite: Claude wertet die Fotos direkt aus,
 * ohne eigenen API Schlüssel. Antwort wird genauso streng geprüft wie auf dem Server.
 */
export function createArtifactRecognizer(): RecognizePallet {
  let sampleP: Promise<SampleFn | null> | null = null
  const holen = () =>
    (sampleP ??= (async () => {
      const c = (globalThis as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
      if (!c) return null
      try {
        return ((await c.use('sample')) as SampleFn) ?? null
      } catch {
        return null
      }
    })())

  return async (bilder, artikel) => {
    if (!navigator.onLine) throw new ErkennungsFehler('Keine Verbindung. Die Analyse startet automatisch, sobald du wieder online bist.')
    const sample = await holen()
    if (!sample) throw new ErkennungsFehler('Die KI ist in dieser Ansicht nicht verfügbar. Bitte die Seite in Claude öffnen oder manuell erfassen.', false)

    const { SYSTEM_PROMPT, nutzerText, kiAntwortValidieren } = await import('../../../api/_lib/analyse')
    const stamm = artikel.map((a) => ({
      nr: a.artikelnummer,
      bez: a.bezeichnung.slice(0, 160),
      gebinde: [a.gebindeart, a.gebindegroesse].filter(Boolean).join(' ').slice(0, 80),
      stueckProLage: a.stueckProLage,
      barcode: a.barcode,
    }))
    const nummern = stamm.map((a) => ({ nr: a.nr, barcode: a.barcode }))
    const [barcode] = await Promise.all([barcodeTeil(bilder, artikel)])
    const prompt = `${SYSTEM_PROMPT}\n\n${nutzerText(stamm)}`

    const aufruf = async (text: string) => {
      try {
        return (await sample(text, { images: bilder.slice(0, 3), modelTier: 'default', cache: false })).text
      } catch (e) {
        const code = (e as { code?: string }).code
        if (code === 'not_granted') throw new ErkennungsFehler('Du hast der Seite die KI Nutzung nicht erlaubt. Über das Menü der Seite unter Berechtigungen änderbar.', false)
        if (code === 'images_unavailable' || code === 'image_rejected') throw new ErkennungsFehler('Die Fotos konnten nicht an die KI übergeben werden. Bitte erneut fotografieren.', false)
        if (code === 'rate_limited') throw new ErkennungsFehler('Zu viele Anfragen in kurzer Zeit. Bitte kurz warten und erneut versuchen.')
        throw new ErkennungsFehler('Die KI hat nicht geantwortet. Bitte erneut versuchen oder manuell erfassen.')
      }
    }

    let antwort = await aufruf(prompt)
    let v = kiAntwortValidieren(antwort, nummern)
    if (!v.ok) {
      antwort = await aufruf(
        `${prompt}\n\nDeine vorherige Antwort war ungültig (${v.fehler}). Antworte jetzt ausschließlich mit einem gültigen JSON Objekt nach dem Schema, ohne weiteren Text.`,
      )
      v = kiAntwortValidieren(antwort, nummern)
    }
    if (!v.ok) throw new ErkennungsFehler('Die KI hat keine verwertbare Antwort geliefert. Bitte erneut versuchen oder manuell erfassen.')
    return { ki: v.ergebnis, ...barcode }
  }
}
