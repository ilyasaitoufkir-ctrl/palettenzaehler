import { describe, expect, it } from 'vitest'
import { laufweg, nachzaehlListe } from '../src/lib/utils/nachzaehl'
import { abweichungUeber, schwelleVon, STANDARD_SCHWELLE } from '../src/lib/utils/pruefung'
import type { Position } from '../src/types'

const pos = (id: string, lagerplatz: string, menge: number, sollMenge: number | null, pruefStatus: Position['pruefStatus'] = 'nicht_noetig') =>
  ({ id, lagerplatz, menge, sollMenge, pruefStatus }) as Position

describe('abweichungUeber', () => {
  it('Standard: jede Abweichung ist auffällig, Gleichheit nie', () => {
    expect(abweichungUeber(10, 10)).toBe(false)
    expect(abweichungUeber(9, 10)).toBe(true)
  })
  it('absolute Schwelle wirkt erst ab dem eingestellten Wert', () => {
    expect(abweichungUeber(8, 10, { absolut: 3, prozent: null })).toBe(false)
    expect(abweichungUeber(7, 10, { absolut: 3, prozent: null })).toBe(true)
  })
  it('Prozent-Schwelle greift zusätzlich, auch wenn absolut klein ist', () => {
    expect(abweichungUeber(95, 100, { absolut: 10, prozent: 5 })).toBe(true)
    expect(abweichungUeber(98, 100, { absolut: 10, prozent: 5 })).toBe(false)
  })
  it('schwelleVon nutzt den Standard ohne Einstellung', () => {
    expect(schwelleVon(undefined)).toEqual(STANDARD_SCHWELLE)
    expect(schwelleVon({ schwelleStueck: 4, schwelleProzent: 2 })).toEqual({ absolut: 4, prozent: 2 })
  })
})

describe('nachzaehlListe', () => {
  it('nimmt offene Prüfungen und Abweichungen über der Schwelle auf, sortiert nach Laufweg', () => {
    const liste = nachzaehlListe(
      [
        pos('1', 'B-02-1', 5, 10),
        pos('2', 'A-10-1', 10, 10, 'offen'),
        pos('3', 'A-02-3', 9, 10),
        pos('4', 'A-02-1', 2, 10),
      ],
      { absolut: 3, prozent: null },
    )
    expect(liste.map((p) => p.id)).toEqual(['4', '2', '1'])
  })
  it('laufweg sortiert Gasse, Platz, Ebene', () => {
    expect(laufweg('A-02-3') < laufweg('A-10-1')).toBe(true)
    expect(laufweg('A-02-1') < laufweg('A-02-3')).toBe(true)
    expect(laufweg('Halle')).toMatch(/^~/)
  })
})

import { nachzaehlCsv } from '../src/lib/utils/nachzaehl'
describe('nachzaehlCsv', () => {
  it('schreibt Kopf, Laufweg und Grund', () => {
    const csv = nachzaehlCsv([pos('1', 'A-02-1', 5, 10)], { absolut: 1, prozent: null })
    const zeilen = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(zeilen[0].startsWith('Lagerplatz;Gasse;Platz;Ebene')).toBe(true)
    expect(zeilen[1]).toContain('A-02-1;A;2;1')
    expect(zeilen[1]).toContain('Menge weicht vom Bestand ab')
  })
})

import { differenzlisteCsv, differenzPositionen } from '../src/lib/utils/differenzliste'
describe('differenzlisteCsv', () => {
  it('nimmt nur Abweichungen über der Schwelle und wählt die Spalten', () => {
    const ps = [pos('1', 'A-02-1', 5, 10), pos('2', 'A-02-2', 10, 10), pos('3', 'A-02-3', 9, 10)]
    const csv = differenzlisteCsv(ps, ['lagerplatz', 'soll', 'ist', 'differenz'], { absolut: 3, prozent: null })
    const zeilen = csv.replace(/^﻿/, '').trim().split('\r\n')
    expect(zeilen[0]).toBe('Lagerplatz;Soll;Ist;Differenz')
    expect(zeilen).toHaveLength(2)
    expect(zeilen[1]).toBe('A-02-1;10;5;-5')
    expect(differenzPositionen(ps, { absolut: 1, prozent: null })).toHaveLength(2)
  })
})
