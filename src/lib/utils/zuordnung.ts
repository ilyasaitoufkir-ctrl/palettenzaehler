import type { Artikel, BestandsPalette } from '../../types'
import { gs1Parsen, nummerNorm, nummernVarianten } from './gs1'

export interface Zuordnung {
  palette: BestandsPalette | null
  artikel: Artikel | null
  /** wodurch zugeordnet wurde, für den Hinweis in der Oberfläche */
  grund: string | null
  /** Charge aus einem GS1 Barcode, falls vorhanden */
  charge: string | null
  /** Palettennummer aus Barcode, auch wenn sie nicht im Bestand ist */
  palettenNummer: string | null
}

/**
 * Schlägt gelesene Nummern (Barcode Scan, KI Ablesung) in Bestandsliste und Artikelstamm nach.
 * Reihenfolge: Palette im Bestand, dann Artikel über Barcode, dann über den internen Schlüssel.
 */
export function nachschlagen(nummern: string[], paletten: BestandsPalette[], artikel: Artikel[]): Zuordnung {
  const roh = nummern.filter(Boolean)
  const varianten = new Set(roh.flatMap(nummernVarianten))
  const gs1 = roh.map(gs1Parsen)
  const charge = gs1.find((g) => g.charge)?.charge ?? null
  const nveAusBarcode = gs1.find((g) => g.nve)?.nve ?? null

  const artikelZu = (nr: string) => {
    const n = nummerNorm(nr)
    return artikel.find((a) => nummerNorm(a.artikelnummer) === n) ?? null
  }

  const palette = paletten.find((p) => nummernVarianten(p.palettenNummer).some((x) => varianten.has(x))) ?? null
  if (palette) {
    return {
      palette,
      artikel: palette.artikelnummer ? artikelZu(palette.artikelnummer) : null,
      grund: `Palette ${palette.palettenNummer} im Bestand gefunden`,
      charge: palette.charge || charge,
      palettenNummer: palette.palettenNummer,
    }
  }
  const perBarcode = artikel.find((a) => a.barcode && nummernVarianten(a.barcode).some((x) => varianten.has(x))) ?? null
  if (perBarcode) return { palette: null, artikel: perBarcode, grund: 'Artikel über Barcode erkannt', charge, palettenNummer: nveAusBarcode }
  const perNummer = artikel.find((a) => varianten.has(nummerNorm(a.artikelnummer))) ?? null
  if (perNummer) return { palette: null, artikel: perNummer, grund: 'Artikel im Stamm erkannt', charge, palettenNummer: nveAusBarcode }
  return { palette: null, artikel: null, grund: null, charge, palettenNummer: nveAusBarcode }
}
