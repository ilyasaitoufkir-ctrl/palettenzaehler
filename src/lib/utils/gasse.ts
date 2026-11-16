import type { Position } from '../../types'
import { SICHTPRUEFUNG_AB_EBENE } from './pruefung'

/** Gasse aus dem Lagerplatz: führende Buchstaben, z. B. "A-01-2" → "A". Ohne Platz: "Ohne Platz". */
export function gasseVon(lagerplatz: string): string {
  const platz = lagerplatz.trim()
  if (!platz) return 'Ohne Platz'
  const m = platz.match(/^[A-Za-zÄÖÜäöüß]+/)
  return m ? m[0].toUpperCase() : platz.slice(0, 1).toUpperCase()
}

export interface GassenZeile {
  gasse: string
  paletten: number
  menge: number
  /** Nachzählung noch offen */
  offen: number
  /** Nachzählung erledigt */
  geprueft: number
  /** Menge weicht vom Bestand ab */
  abweichung: number
  /** Identität unklar oder nur Sichtprüfung */
  eingeschraenkt: number
}

/** Fortschritt und Kennzahlen je Gasse, sortiert nach Gassenname */
export function fortschrittProGasse(positionen: Position[]): GassenZeile[] {
  const map = new Map<string, GassenZeile>()
  for (const p of positionen) {
    const g = gasseVon(p.lagerplatz)
    const z = map.get(g) ?? { gasse: g, paletten: 0, menge: 0, offen: 0, geprueft: 0, abweichung: 0, eingeschraenkt: 0 }
    z.paletten += 1
    z.menge += p.menge
    if (p.pruefStatus === 'offen') z.offen += 1
    if (p.pruefStatus === 'geprueft') z.geprueft += 1
    if (p.sollMenge !== null && p.sollMenge !== p.menge) z.abweichung += 1
    if (p.identitaetUnklar || (p.ebene && Number(p.ebene) >= SICHTPRUEFUNG_AB_EBENE)) z.eingeschraenkt += 1
    map.set(g, z)
  }
  return [...map.values()].sort((a, b) => a.gasse.localeCompare(b.gasse, 'de'))
}

export interface GassenPlatz {
  lagerplatz: string
  palettenNummer: string
  bezeichnung: string
  /** true, wenn für diese Palette schon eine Position erfasst ist */
  erledigt: boolean
}

export interface GassenBlock {
  gasse: string
  plaetze: GassenPlatz[]
  erledigt: number
  gesamt: number
}

export interface GassenListe {
  gassen: GassenBlock[]
  /** erfasste Paletten, die nicht in der Bestandsliste stehen */
  nichtImBestand: number
}

const normNummer = (s: string) => s.replace(/\s+/g, '').toUpperCase()

/**
 * Feste Reihenfolge der Plätze je Gasse. Grundlage ist die Bestandsliste:
 * jede Palette darin ist entweder erledigt (Position erfasst) oder offen.
 * Ohne Bestandsliste entstehen die Plätze aus den erfassten Positionen.
 */
export function gassenListe(bestand: { palettenNummer: string; lagerplatz: string; bezeichnung: string }[], positionen: Position[]): GassenListe {
  const erfasst = new Set(positionen.map((p) => normNummer(p.palettenNummer)).filter(Boolean))
  const imBestand = new Set(bestand.map((b) => normNummer(b.palettenNummer)).filter(Boolean))

  const quelle: GassenPlatz[] =
    bestand.length > 0
      ? bestand.map((b) => ({
          lagerplatz: b.lagerplatz,
          palettenNummer: b.palettenNummer,
          bezeichnung: b.bezeichnung,
          erledigt: erfasst.has(normNummer(b.palettenNummer)),
        }))
      : positionen.map((p) => ({
          lagerplatz: p.lagerplatz,
          palettenNummer: p.palettenNummer,
          bezeichnung: p.bezeichnung,
          erledigt: true,
        }))

  const map = new Map<string, GassenBlock>()
  for (const platz of quelle) {
    const g = gasseVon(platz.lagerplatz)
    const block = map.get(g) ?? { gasse: g, plaetze: [], erledigt: 0, gesamt: 0 }
    block.plaetze.push(platz)
    block.gesamt += 1
    if (platz.erledigt) block.erledigt += 1
    map.set(g, block)
  }
  const gassen = [...map.values()]
    .map((b) => ({ ...b, plaetze: b.plaetze.sort((a, c) => a.lagerplatz.localeCompare(c.lagerplatz, 'de', { numeric: true })) }))
    .sort((a, b) => a.gasse.localeCompare(b.gasse, 'de'))

  const nichtImBestand = bestand.length > 0 ? positionen.filter((p) => !imBestand.has(normNummer(p.palettenNummer))).length : 0
  return { gassen, nichtImBestand }
}
