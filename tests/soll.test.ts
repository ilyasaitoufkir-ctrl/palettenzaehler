import { describe, expect, it } from 'vitest'
import { anzahlText, sollBekannt } from '../src/lib/utils/soll'

describe('anzahlText', () => {
  it('bildet Singular und Plural korrekt', () => {
    expect(anzahlText(1, 'Position', 'Positionen')).toBe('1 Position')
    expect(anzahlText(0, 'Position', 'Positionen')).toBe('0 Positionen')
    expect(anzahlText(2, 'Position', 'Positionen')).toBe('2 Positionen')
  })
})

describe('sollBekannt', () => {
  it('ist false ohne Bestandsliste und ohne Soll in den Positionen', () => {
    expect(sollBekannt([], [{ sollMenge: null }])).toBe(false)
  })
  it('ist true, sobald eine Bestandsliste oder ein Soll vorhanden ist', () => {
    expect(sollBekannt([{}], [])).toBe(true)
    expect(sollBekannt([], [{ sollMenge: null }, { sollMenge: 12 }])).toBe(true)
  })
})
