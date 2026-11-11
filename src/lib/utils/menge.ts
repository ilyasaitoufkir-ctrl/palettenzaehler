export interface MengenEingabe {
  lagen: number | null | undefined
  stueckProLage: number | null | undefined
  fehlend: number | null | undefined
}

export interface MengenErgebnis {
  /** berechnete Gesamtmenge, null wenn nicht berechenbar */
  menge: number | null
  /** Grund, warum keine Menge berechnet werden konnte */
  fehler: string | null
  /** Bruttomenge vor Abzug der fehlenden Stück */
  brutto: number | null
}

const istGesetzt = (v: number | null | undefined): v is number => typeof v === 'number' && !Number.isNaN(v)

/**
 * Gesamtmenge = Lagen × Stück pro Lage − fehlende Stück
 * Wird immer im Frontend berechnet, nie blind aus der KI übernommen.
 */
export function berechneMenge({ lagen, stueckProLage, fehlend }: MengenEingabe): MengenErgebnis {
  const f = istGesetzt(fehlend) ? fehlend : 0

  for (const [name, wert] of [
    ['Lagen', lagen],
    ['Stück pro Lage', stueckProLage],
    ['Fehlende Stück', fehlend],
  ] as const) {
    if (!istGesetzt(wert)) continue
    if (!Number.isFinite(wert)) return { menge: null, brutto: null, fehler: `${name}: ungültiger Wert` }
    if (wert < 0) return { menge: null, brutto: null, fehler: `${name} darf nicht negativ sein` }
    if (!Number.isInteger(wert)) return { menge: null, brutto: null, fehler: `${name}: bitte ganze Zahl eingeben` }
  }

  if (!istGesetzt(lagen) || !istGesetzt(stueckProLage)) {
    return { menge: null, brutto: null, fehler: 'Lagen und Stück pro Lage eintragen' }
  }

  const brutto = lagen * stueckProLage
  if (f > brutto) {
    return {
      menge: null,
      brutto,
      fehler: `Fehlende Stück (${f}) sind mehr als die volle Menge (${brutto})`,
    }
  }
  return { menge: brutto - f, brutto, fehler: null }
}

/** Wandelt Formulareingaben in Zahlen um. Leere Felder werden zu null. */
export function parseZahl(eingabe: string): number | null {
  const s = eingabe.trim().replace(',', '.')
  if (s === '') return null
  const n = Number(s)
  return Number.isNaN(n) ? Number.NaN : n
}

/** true, wenn die KI Gesamtzahl von der selbst berechneten Menge abweicht */
export function kiWeichtAb(kiGesamt: number | null | undefined, menge: number | null): boolean {
  if (!istGesetzt(kiGesamt) || menge === null) return false
  return kiGesamt !== menge
}
