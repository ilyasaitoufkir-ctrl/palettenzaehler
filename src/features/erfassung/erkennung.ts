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
    const antwort = (await res.json().catch(() => ({}))) as { ergebnis?: KiErgebnis; fehler?: string }
    if (!res.ok || !antwort.ergebnis) {
      const dauerhaft = [400, 401, 403, 413, 415].includes(res.status)
      throw new ErkennungsFehler(antwort.fehler ?? `Analyse fehlgeschlagen (${res.status}).`, !dauerhaft)
    }
    return { ki: antwort.ergebnis, ...barcode, demo: false }
  }
}

/** Kleiner, stabiler Hash über die Bildbytes, damit die Simulation pro Foto gleich bleibt */
async function bildHash(bilder: Blob[]): Promise<number> {
  let h = 2166136261
  for (const b of bilder) {
    const buf = new Uint8Array(await b.slice(0, 4096).arrayBuffer())
    for (let i = 0; i < buf.length; i += 7) h = Math.imul(h ^ buf[i], 16777619)
    h = Math.imul(h ^ b.size, 16777619)
  }
  return h >>> 0
}

/**
 * Simulierte Erkennung für den Demo Modus. Sie sieht die Bilder NICHT an,
 * sondern erzeugt einen plausiblen Vorschlag aus dem Artikelstamm. Das steht auch in den Hinweisen.
 */
export const demoRecognizer: RecognizePallet = async (bilder, artikel) => {
  await new Promise((r) => setTimeout(r, 1400))
  const barcode = await barcodeTeil(bilder, artikel)
  const h = await bildHash(bilder)
  const barcodeArtikel = artikel.find((a) => a.artikelnummer === barcode.barcodeArtikelnummer)
  const a = barcodeArtikel ?? (artikel.length ? artikel[h % artikel.length] : null)
  const spl = a?.stueckProLage ?? 10
  const lagenVoll = a?.lagenProPalette ?? 2
  const lagen = Math.max(1, lagenVoll - (h % 3 === 0 ? 1 : 0))
  const fehlend = h % 4 === 0 ? Math.min(spl - 1, 1 + (h % 5)) : 0
  const konfidenz = (['hoch', 'mittel', 'niedrig'] as const)[h % 3]
  const ki: KiErgebnis = {
    artikel_match: a?.artikelnummer ?? null,
    beschreibung: a ? `${a.gebindeart} ${a.gebindegroesse} ${a.bezeichnung}`.trim() : 'Kein Artikel im Stamm',
    gebindeart: a ? `${a.gebindeart} ${a.gebindegroesse}`.trim() : 'unbekannt',
    etikett_text: a ? a.artikelnummer : null,
    stueck_pro_lage: spl,
    lagen,
    fehlende_stueck: fehlend,
    // bewusst manchmal abweichend, um die Prüfwarnung vorzuführen
    gesamt_geschaetzt: lagen * spl - fehlend + (h % 7 === 0 ? 2 : 0),
    konfidenz,
    hinweise:
      'Demo Modus: simulierte Erkennung, das Foto wurde nicht ausgewertet. Werte bitte prüfen.' +
      (konfidenz === 'niedrig' ? ' Beispiel für niedrige Konfidenz: Kern der Palette nicht sichtbar.' : ''),
  }
  return { ki, ...barcode, demo: true }
}
