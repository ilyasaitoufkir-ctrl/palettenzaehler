import { describe, expect, it } from 'vitest'
import { platzMeldungen } from '../src/lib/utils/platz'
import type { BestandsPalette } from '../src/types'

const b = (palettenNummer: string, lagerplatz: string): BestandsPalette =>
  ({ id: palettenNummer, palettenNummer, lagerplatz, artikelnummer: '', bezeichnung: '', menge: 10, charge: '' }) as BestandsPalette

const bestand = [b('P-1', 'A-01-1'), b('P-2', 'A-01-1'), b('P-3', 'B-03-1')]

describe('platzMeldungen', () => {
  it('meldet richtigen Platz', () => {
    const m = platzMeldungen({ palettenNummer: 'P-1', aktivPlatz: 'a-01-1', bestand, erfasst: [] })
    expect(m[0]).toEqual({ ton: 'ok', text: 'Richtiger Platz' })
  })

  it('meldet falschen Platz mit dem Soll-Platz', () => {
    const m = platzMeldungen({ palettenNummer: 'P-3', aktivPlatz: 'A-01-1', bestand, erfasst: [] })
    expect(m[0].text).toBe('Falscher Platz (laut Soll auf B-03-1)')
    expect(m[0].ton).toBe('warn')
  })

  it('meldet Palette, die nicht im Soll steht', () => {
    const m = platzMeldungen({ palettenNummer: 'X-9', aktivPlatz: 'A-01-1', bestand, erfasst: [] })
    expect(m[0]).toEqual({ ton: 'bad', text: 'Palette nicht im Soll' })
  })

  it('meldet fehlende Palette auf belegtem Stellplatz', () => {
    const m = platzMeldungen({ palettenNummer: 'P-1', aktivPlatz: 'A-01-1', bestand, erfasst: ['P-1'] })
    expect(m.map((x) => x.text)).toEqual(['Richtiger Platz', 'Stellplatz laut Soll belegt, Palette P-2 fehlt'])
  })

  it('zählt bereits erfasste Paletten nicht als fehlend', () => {
    const m = platzMeldungen({ palettenNummer: 'P-1', aktivPlatz: 'A-01-1', bestand, erfasst: ['P-1', 'P-2'] })
    expect(m.map((x) => x.text)).toEqual(['Richtiger Platz'])
  })

  it('liefert ohne Stellplatz und ohne Palettennummer nichts', () => {
    expect(platzMeldungen({ palettenNummer: '', aktivPlatz: '', bestand, erfasst: [] })).toEqual([])
  })
})
