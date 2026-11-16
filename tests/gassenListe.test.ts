import { describe, expect, it } from 'vitest'
import { gassenListe } from '../src/lib/utils/gasse'
import type { Position } from '../src/types'

const pos = (palettenNummer: string, lagerplatz: string): Position =>
  ({ palettenNummer, lagerplatz, bezeichnung: 'Chlor', menge: 10 }) as unknown as Position

describe('gassenListe', () => {
  const bestand = [
    { palettenNummer: 'P-2', lagerplatz: 'B-02-1', bezeichnung: 'Öl' },
    { palettenNummer: 'P-1', lagerplatz: 'A-10-1', bezeichnung: 'Öl' },
    { palettenNummer: 'P-3', lagerplatz: 'A-02-1', bezeichnung: 'Öl' },
  ]

  it('markiert erfasste Paletten als erledigt und den Rest als offen', () => {
    const { gassen } = gassenListe(bestand, [pos(' p-1 ', 'A-10-1')])
    const a = gassen.find((g) => g.gasse === 'A')!
    expect(a.gesamt).toBe(2)
    expect(a.erledigt).toBe(1)
    expect(a.plaetze.find((p) => p.palettenNummer === 'P-1')?.erledigt).toBe(true)
    expect(a.plaetze.find((p) => p.palettenNummer === 'P-3')?.erledigt).toBe(false)
  })

  it('sortiert die Plätze fest und numerisch nach Lagerplatz', () => {
    const { gassen } = gassenListe(bestand, [])
    expect(gassen[0].plaetze.map((p) => p.lagerplatz)).toEqual(['A-02-1', 'A-10-1'])
    expect(gassen.map((g) => g.gasse)).toEqual(['A', 'B'])
  })

  it('zählt erfasste Paletten, die nicht im Bestand stehen', () => {
    const { nichtImBestand } = gassenListe(bestand, [pos('P-1', 'A-10-1'), pos('X-9', 'C-01-1')])
    expect(nichtImBestand).toBe(1)
  })

  it('baut ohne Bestandsliste die Plätze aus den erfassten Positionen', () => {
    const { gassen, nichtImBestand } = gassenListe([], [pos('X-1', 'C-01-1')])
    expect(gassen[0].gasse).toBe('C')
    expect(gassen[0].erledigt).toBe(1)
    expect(nichtImBestand).toBe(0)
  })
})
