import { describe, expect, it } from 'vitest'
import { berechneMenge, kiWeichtAb, parseZahl } from '../src/lib/utils/menge'

describe('berechneMenge', () => {
  it('3 Lagen × 10 Stück = 30', () => {
    expect(berechneMenge({ lagen: 3, stueckProLage: 10, fehlend: 0 }).menge).toBe(30)
  })
  it('3 Lagen × 10 Stück − 2 fehlende = 28', () => {
    expect(berechneMenge({ lagen: 3, stueckProLage: 10, fehlend: 2 }).menge).toBe(28)
  })
  it('fehlend nicht gesetzt zählt als 0', () => {
    expect(berechneMenge({ lagen: 2, stueckProLage: 12, fehlend: null }).menge).toBe(24)
  })
  it('Nullwerte: leere Palette ergibt 0', () => {
    expect(berechneMenge({ lagen: 0, stueckProLage: 10, fehlend: 0 })).toMatchObject({ menge: 0, fehler: null })
    expect(berechneMenge({ lagen: 3, stueckProLage: 0, fehlend: 0 }).menge).toBe(0)
  })
  it('unbekannte Werte: keine Menge, Hinweis', () => {
    const r = berechneMenge({ lagen: null, stueckProLage: 10, fehlend: 0 })
    expect(r.menge).toBeNull()
    expect(r.fehler).toMatch(/eintragen/)
    expect(berechneMenge({ lagen: 3, stueckProLage: undefined, fehlend: 0 }).menge).toBeNull()
  })
  it('fehlende Stück größer als Gesamtmenge wird abgelehnt', () => {
    const r = berechneMenge({ lagen: 1, stueckProLage: 10, fehlend: 11 })
    expect(r.menge).toBeNull()
    expect(r.brutto).toBe(10)
    expect(r.fehler).toMatch(/mehr als/)
  })
  it('fehlend gleich Gesamtmenge ergibt 0', () => {
    expect(berechneMenge({ lagen: 1, stueckProLage: 10, fehlend: 10 }).menge).toBe(0)
  })
  it('negative Eingaben werden abgelehnt', () => {
    expect(berechneMenge({ lagen: -1, stueckProLage: 10, fehlend: 0 }).fehler).toMatch(/negativ/)
    expect(berechneMenge({ lagen: 2, stueckProLage: 10, fehlend: -3 }).menge).toBeNull()
  })
  it('Kommazahlen und NaN werden abgelehnt', () => {
    expect(berechneMenge({ lagen: 2.5, stueckProLage: 10, fehlend: 0 }).fehler).toMatch(/ganze Zahl/)
    expect(berechneMenge({ lagen: Number.NaN, stueckProLage: 10, fehlend: 0 }).menge).toBeNull()
    expect(berechneMenge({ lagen: Infinity, stueckProLage: 10, fehlend: 0 }).menge).toBeNull()
  })
})

describe('parseZahl und kiWeichtAb', () => {
  it('leer wird null, Text wird NaN', () => {
    expect(parseZahl('')).toBeNull()
    expect(parseZahl(' 12 ')).toBe(12)
    expect(Number.isNaN(parseZahl('abc'))).toBe(true)
  })
  it('meldet Abweichung nur bei echten Unterschieden', () => {
    expect(kiWeichtAb(30, 28)).toBe(true)
    expect(kiWeichtAb(28, 28)).toBe(false)
    expect(kiWeichtAb(null, 28)).toBe(false)
    expect(kiWeichtAb(30, null)).toBe(false)
  })
})
