/** Anzahl mit korrektem Singular oder Plural, z. B. "1 Position", "3 Positionen" */
export function anzahlText(n: number, ein: string, mehrere: string): string {
  return `${n} ${n === 1 ? ein : mehrere}`
}

/** Ist überhaupt ein Sollbestand bekannt? Sonst sind Differenzen nicht verfügbar. */
export function sollBekannt(bestand: unknown[], positionen: { sollMenge: number | null }[]): boolean {
  return bestand.length > 0 || positionen.some((p) => p.sollMenge !== null)
}
