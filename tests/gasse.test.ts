import { describe, expect, it } from 'vitest'
import { fortschrittProGasse, gasseVon } from '../src/lib/utils/gasse'
import { pruefGruende } from '../src/lib/utils/pruefung'
import type { Position } from '../src/types'

const p = (o: Partial<Position>): Position =>
  ({ lagerplatz: 'A-01-2', menge: 10, sollMenge: null, pruefStatus: 'nicht_noetig', identitaetUnklar: false, ebene: '', konfidenz: 'hoch', lagerplatzLaut: '', ...o }) as Position

describe('Gasse', () => {
  it('liest die Gasse aus dem Lagerplatz', () => {
    expect(gasseVon('A-01-2')).toBe('A')
    expect(gasseVon('b3')).toBe('B')
    expect(gasseVon('')).toBe('Ohne Platz')
  })
  it('zählt Paletten, offene Nachzählung und Eingeschränkte je Gasse', () => {
    const z = fortschrittProGasse([
      p({ lagerplatz: 'A-01-1', menge: 5, sollMenge: 6 }),
      p({ lagerplatz: 'A-02-5', ebene: '5', pruefStatus: 'offen' }),
      p({ lagerplatz: 'B-01-1', identitaetUnklar: true, pruefStatus: 'geprueft' }),
    ])
    expect(z.map((x) => x.gasse)).toEqual(['A', 'B'])
    expect(z[0]).toMatchObject({ paletten: 2, menge: 15, offen: 1, abweichung: 1, eingeschraenkt: 1 })
    expect(z[1]).toMatchObject({ paletten: 1, geprueft: 1, eingeschraenkt: 1 })
  })
})

describe('Prüfgründe für Identität und Ebene', () => {
  const basis = { menge: 4, sollMenge: null, konfidenz: 'hoch' as const, lagerplatz: 'A-01-1', lagerplatzLaut: '' }
  it('verlangt Nachzählung bei unklarer Identität', () => {
    expect(pruefGruende({ ...basis, identitaetUnklar: true })).toEqual(['Identität unklar, Etikett nicht eindeutig lesbar'])
  })
  it('verlangt Nachzählung ab Ebene 5 nur per Sichtprüfung', () => {
    expect(pruefGruende({ ...basis, ebene: '5' })).toEqual(['Ebene 5, nur Sichtprüfung'])
    expect(pruefGruende({ ...basis, ebene: '4' })).toEqual([])
  })
})
