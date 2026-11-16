import type { Position } from '../../types'
import { abweichungUeber, pruefGruende, type Schwelle } from './pruefung'
import { parseStellplatz, type PlatzFormat } from './lagerplan'
import { csvAusZeilen } from './csv'

/** Positionen, die nachgezählt werden müssen: offene Prüfung oder Abweichung über der Schwelle */
export function nachzaehlListe(positionen: Position[], schwelle: Schwelle, format: PlatzFormat = 'gasse-platz-ebene'): Position[] {
  const liste = positionen.filter(
    (p) => p.pruefStatus === 'offen' || (p.sollMenge !== null && abweichungUeber(p.menge, p.sollMenge, schwelle)),
  )
  return liste.sort((a, b) => laufweg(a.lagerplatz, format).localeCompare(laufweg(b.lagerplatz, format), 'de', { numeric: true }))
}

/**
 * Laufweg für die Nachzählung: Gasse, dann Platz, dann Ebene.
 * Unlesbare Plätze kommen ans Ende, sortiert nach Schreibweise.
 */
export function laufweg(lagerplatz: string, format: PlatzFormat = 'gasse-platz-ebene'): string {
  const s = parseStellplatz(lagerplatz, format)
  if (!s) return `~${lagerplatz.trim().toUpperCase()}`
  return `${s.gasse}-${String(s.platz).padStart(4, '0')}-${String(s.ebene).padStart(3, '0')}`
}

/** Begründung für die Liste, z. B. "Menge weicht vom Bestand ab (Soll 10, Ist 6)" */
export function nachzaehlGrund(p: Position, schwelle: Schwelle): string {
  const gruende = pruefGruende({ ...p, schwelle })
  return gruende.length ? gruende.join('; ') : 'Nachzählung offen'
}

/** Nachzählliste als CSV, in Laufwegreihenfolge */
export function nachzaehlCsv(liste: Position[], schwelle: Schwelle, format: PlatzFormat = 'gasse-platz-ebene'): string {
  const zeilen = liste.map((p) => {
    const s = parseStellplatz(p.lagerplatz, format)
    const diff = p.sollMenge === null ? '' : p.menge - p.sollMenge
    return [
      p.lagerplatz,
      s?.gasse ?? '',
      s?.platz ?? '',
      s?.ebene ?? p.ebene,
      p.palettenNummer,
      p.bezeichnung,
      p.menge,
      p.sollMenge ?? '',
      diff,
      p.pruefStatus === 'offen' ? 'offen' : 'nachgezählt',
      nachzaehlGrund(p, schwelle),
    ]
  })
  return csvAusZeilen(
    ['Lagerplatz', 'Gasse', 'Platz', 'Ebene', 'Palettennummer', 'Bezeichnung', 'Menge', 'Soll', 'Differenz', 'Status', 'Grund'],
    zeilen,
  )
}
