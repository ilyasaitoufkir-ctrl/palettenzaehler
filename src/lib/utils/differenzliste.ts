import type { Position } from '../../types'
import { csvAusZeilen } from './csv'
import { parseStellplatz } from './lagerplan'
import { nachzaehlGrund, laufweg } from './nachzaehl'
import { abweichungUeber, type Schwelle } from './pruefung'

/** Felder, die in der Differenzliste vorkommen können */
export const DIFF_FELDER = [
  { feld: 'lagerplatz', label: 'Lagerplatz' },
  { feld: 'gasse', label: 'Gasse' },
  { feld: 'palettenNummer', label: 'Palettennummer' },
  { feld: 'bezeichnung', label: 'Bezeichnung' },
  { feld: 'charge', label: 'Charge' },
  { feld: 'soll', label: 'Soll' },
  { feld: 'ist', label: 'Ist' },
  { feld: 'differenz', label: 'Differenz' },
  { feld: 'status', label: 'Status' },
  { feld: 'grund', label: 'Grund' },
] as const

export type DiffFeld = (typeof DIFF_FELDER)[number]['feld']

/** Standard für die Differenzliste, abweichungsrelevante Felder zuerst */
export const STANDARD_DIFF_FELDER: DiffFeld[] = ['palettenNummer', 'lagerplatz', 'bezeichnung', 'soll', 'ist', 'differenz', 'status']

/** Positionen mit Abweichung über der Schwelle, in Laufwegreihenfolge */
export function differenzPositionen(positionen: Position[], schwelle: Schwelle): Position[] {
  return positionen
    .filter((p) => p.sollMenge !== null && abweichungUeber(p.menge, p.sollMenge, schwelle))
    .sort((a, b) => laufweg(a.lagerplatz).localeCompare(laufweg(b.lagerplatz), 'de', { numeric: true }))
}

/** Differenzliste als CSV mit frei gewählten Spalten in gewählter Reihenfolge */
export function differenzlisteCsv(positionen: Position[], felder: DiffFeld[], schwelle: Schwelle): string {
  const zeilen = differenzPositionen(positionen, schwelle).map((p) => {
    const s = parseStellplatz(p.lagerplatz)
    const werte: Record<DiffFeld, unknown> = {
      lagerplatz: p.lagerplatz,
      gasse: s?.gasse ?? '',
      palettenNummer: p.palettenNummer,
      bezeichnung: p.bezeichnung,
      charge: p.charge,
      soll: p.sollMenge,
      ist: p.menge,
      differenz: p.sollMenge === null ? '' : p.menge - p.sollMenge,
      status: p.pruefStatus === 'offen' ? 'Nachzählung offen' : p.pruefStatus === 'geprueft' ? 'nachgezählt' : 'ok',
      grund: nachzaehlGrund(p, schwelle),
    }
    return felder.map((f) => werte[f])
  })
  const label = (f: DiffFeld) => DIFF_FELDER.find((d) => d.feld === f)?.label ?? f
  return csvAusZeilen(felder.map(label), zeilen)
}

const KEY = 'pz-differenz-felder'

export function ladeDiffFelder(): DiffFeld[] {
  try {
    const roh = localStorage.getItem(KEY)
    if (!roh) return STANDARD_DIFF_FELDER
    const gültig = new Set<string>(DIFF_FELDER.map((d) => d.feld))
    const liste = (JSON.parse(roh) as string[]).filter((f): f is DiffFeld => gültig.has(f))
    return liste.length ? liste : STANDARD_DIFF_FELDER
  } catch {
    return STANDARD_DIFF_FELDER
  }
}

export function speichereDiffFelder(felder: DiffFeld[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(felder))
  } catch {
    // ohne Speicher gilt die Auswahl nur für diese Sitzung
  }
}

/** Fiktive Beispieldatei zum Testen des Einlesens im ERP. Keine echten Daten. */
export function beispielDifferenzCsv(felder: DiffFeld[]): string {
  const demo: Record<DiffFeld, unknown>[] = [
    { lagerplatz: 'A-01-1', gasse: 'A', palettenNummer: 'PAL-DEMO-001', bezeichnung: 'Demo Produkt A', charge: 'DEMO-C1', soll: 120, ist: 110, differenz: -10, status: 'Nachzählung offen', grund: 'Menge weicht vom Bestand ab' },
    { lagerplatz: 'A-02-2', gasse: 'A', palettenNummer: 'PAL-DEMO-002', bezeichnung: 'Demo Produkt B', charge: 'DEMO-C2', soll: 80, ist: 84, differenz: 4, status: 'nachgezählt', grund: 'Menge weicht vom Bestand ab' },
    { lagerplatz: 'B-03-1', gasse: 'B', palettenNummer: 'PAL-DEMO-003', bezeichnung: 'Demo Produkt C', charge: '', soll: 40, ist: 0, differenz: -40, status: 'Nachzählung offen', grund: 'Palette leer' },
  ]
  return csvAusZeilen(
    felder.map((f) => DIFF_FELDER.find((d) => d.feld === f)?.label ?? f),
    demo.map((r) => felder.map((f) => r[f])),
  )
}
