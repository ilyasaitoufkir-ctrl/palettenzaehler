import type { BestandsPalette } from '../../types'

export type PlatzTon = 'ok' | 'warn' | 'bad'
export interface PlatzMeldung {
  ton: PlatzTon
  text: string
}

const normNummer = (s: string) => s.replace(/\s+/g, '').toUpperCase()
const normPlatz = (s: string) => s.trim().toUpperCase()

/**
 * Sofortige Prüfung der Palette gegen den aktiven Stellplatz und den Sollbestand.
 * Reine Funktion, ohne Speicher. Liefert keine Meldung, wenn zu wenig bekannt ist.
 */
export function platzMeldungen(args: {
  palettenNummer: string
  aktivPlatz: string
  bestand: BestandsPalette[]
  /** Palettennummern, die bereits erfasst sind */
  erfasst: string[]
}): PlatzMeldung[] {
  const { palettenNummer, aktivPlatz, bestand, erfasst } = args
  const meldungen: PlatzMeldung[] = []
  const platz = normPlatz(aktivPlatz)
  const nummer = normNummer(palettenNummer)

  if (nummer) {
    const treffer = bestand.find((b) => normNummer(b.palettenNummer) === nummer)
    if (!treffer) {
      meldungen.push({ ton: 'bad', text: 'Palette nicht im Soll' })
    } else if (platz) {
      meldungen.push(
        normPlatz(treffer.lagerplatz) === platz
          ? { ton: 'ok', text: 'Richtiger Platz' }
          : { ton: 'warn', text: `Falscher Platz (laut Soll auf ${treffer.lagerplatz || 'unbekannt'})` },
      )
    }
  }

  if (platz) {
    const erfassteSet = new Set(erfasst.map(normNummer))
    const fehlend = bestand.filter(
      (b) => normPlatz(b.lagerplatz) === platz && normNummer(b.palettenNummer) !== nummer && !erfassteSet.has(normNummer(b.palettenNummer)),
    )
    if (fehlend.length) {
      const mehr = fehlend.length > 1 ? ` (und ${fehlend.length - 1} weitere)` : ''
      meldungen.push({ ton: 'warn', text: `Stellplatz laut Soll belegt, Palette ${fehlend[0].palettenNummer} fehlt${mehr}` })
    }
  }
  return meldungen
}
