import { BESTAND_FELDER, type BestandFeld, type BestandZuordnung, vorschlagZuordnung } from './csv'

/**
 * Gespeicherte Spaltenzuordnung für den Bestandsimport. Gespeichert werden die Spaltennamen,
 * nicht die Spaltennummern, damit die Vorlage auch bei verschobenen Spalten passt.
 */
const KEY = 'pz-bestand-zuordnung'

type Gespeichert = Partial<Record<BestandFeld, string>>

export function ladeBestandVorlage(kopf: string[]): BestandZuordnung {
  try {
    const roh = localStorage.getItem(KEY)
    if (!roh) return {}
    const gespeichert = JSON.parse(roh) as Gespeichert
    const z: BestandZuordnung = {}
    for (const { feld } of BESTAND_FELDER) {
      const name = gespeichert[feld]
      const idx = name ? kopf.indexOf(name) : -1
      if (idx >= 0) z[feld] = idx
    }
    return z
  } catch {
    return {}
  }
}

/** Zuordnung für den nächsten Import: Vorlage, und wo sie fehlt, der Vorschlag aus den Spaltennamen */
export function startZuordnung(kopf: string[]): BestandZuordnung {
  return { ...vorschlagZuordnung(kopf), ...ladeBestandVorlage(kopf) }
}

export function speichereBestandVorlage(kopf: string[], z: BestandZuordnung) {
  const gespeichert: Gespeichert = {}
  for (const { feld } of BESTAND_FELDER) {
    const idx = z[feld]
    if (idx !== undefined && kopf[idx] !== undefined) gespeichert[feld] = kopf[idx]
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(gespeichert))
  } catch {
    // ohne Speicher gilt die Zuordnung nur für diesen Import
  }
}
