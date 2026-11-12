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
