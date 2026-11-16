import type { BestandsPalette, Position } from '../../types'
import { SICHTPRUEFUNG_AB_EBENE } from './pruefung'

/** Reihenfolge der Teile in der Stellplatz ID, z. B. "A-01-2" = Gasse, Platz, Ebene */
export type PlatzFormat = 'gasse-platz-ebene' | 'gasse-ebene-platz'

export const PLATZ_FORMATE: { wert: PlatzFormat; label: string; beispiel: string }[] = [
  { wert: 'gasse-platz-ebene', label: 'Gasse, Platz, Ebene', beispiel: 'A-01-2' },
  { wert: 'gasse-ebene-platz', label: 'Gasse, Ebene, Platz', beispiel: 'A-2-01' },
]

export interface Stellplatz {
  gasse: string
  platz: number
  ebene: number
  /** ursprüngliche Schreibweise, dient als Schlüssel */
  id: string
}

/** Zerlegt eine Stellplatz ID nach dem gewählten Format. Unbekannte Formen ergeben null. */
export function parseStellplatz(id: string, format: PlatzFormat = 'gasse-platz-ebene'): Stellplatz | null {
  const m = id.trim().match(/^([A-Za-zÄÖÜäöüß]+)[-\s]?(\d{1,3})[-\s]?(\d{1,2})$/)
  if (!m) return null
  const [, gasse, a, b] = m
  const [platz, ebene] = format === 'gasse-platz-ebene' ? [Number(a), Number(b)] : [Number(b), Number(a)]
  return { gasse: gasse.toUpperCase(), platz, ebene, id: id.trim().toUpperCase() }
}

export type FeldStatus = 'offen' | 'ok' | 'abweichung' | 'nachzaehlen'

const RANG: Record<FeldStatus, number> = { offen: 0, ok: 1, abweichung: 2, nachzaehlen: 3 }

/** Schlechtester Status aller Positionen auf einem Stellplatz. Ohne Position: offen. */
export function stellplatzStatus(positionen: Position[]): FeldStatus {
  if (positionen.length === 0) return 'offen'
  let schlechtester: FeldStatus = 'ok'
  for (const p of positionen) {
    let s: FeldStatus = 'ok'
    if (p.sollMenge !== null && p.sollMenge !== p.menge) s = 'abweichung'
    if (p.pruefStatus === 'offen') s = 'nachzaehlen'
    if (RANG[s] > RANG[schlechtester]) schlechtester = s
  }
  return schlechtester
}

export interface LagerplanZelle {
  stellplatz: Stellplatz
  status: FeldStatus
  positionen: Position[]
  /** Soll Paletten auf diesem Platz laut Bestand */
  sollAnzahl: number
}

export interface Lagerplan {
  gassen: string[]
  ebenen: number[]
  /** Schlüssel: `${gasse}|${ebene}|${platz}` */
  zellen: Map<string, LagerplanZelle>
  /** Stellplatz IDs, die nicht lesbar waren */
  unlesbar: number
}

export const zellenSchluessel = (gasse: string, ebene: number, platz: number) => `${gasse}|${ebene}|${platz}`

/** Baut den Lagerplan aus Bestand und Positionen. Ebenen von oben (höchste) nach unten. */
export function baueLagerplan(bestand: BestandsPalette[], positionen: Position[], format: PlatzFormat = 'gasse-platz-ebene'): Lagerplan {
  const zellen = new Map<string, LagerplanZelle>()
  const ort = (id: string) => {
    const s = parseStellplatz(id, format)
    if (!s) return null
    const key = zellenSchluessel(s.gasse, s.ebene, s.platz)
    let z = zellen.get(key)
    if (!z) {
      z = { stellplatz: s, status: 'offen', positionen: [], sollAnzahl: 0 }
      zellen.set(key, z)
    }
    return z
  }

  let unlesbar = 0
  for (const b of bestand) {
    const z = ort(b.lagerplatz)
    if (z) z.sollAnzahl += 1
    else if (b.lagerplatz.trim()) unlesbar += 1
  }
  for (const p of positionen) {
    const z = ort(p.lagerplatz)
    if (z) z.positionen.push(p)
    else if (p.lagerplatz.trim()) unlesbar += 1
  }
  for (const z of zellen.values()) z.status = stellplatzStatus(z.positionen)

  const alle = [...zellen.values()].map((z) => z.stellplatz)
  const gassen = [...new Set(alle.map((s) => s.gasse))].sort((a, b) => a.localeCompare(b, 'de'))
  const hoch = Math.max(SICHTPRUEFUNG_AB_EBENE, ...alle.map((s) => s.ebene), 1)
  const ebenen = Array.from({ length: hoch }, (_, i) => hoch - i)
  return { gassen, ebenen, zellen, unlesbar }
}
