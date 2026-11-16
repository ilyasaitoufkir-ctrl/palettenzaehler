import { describe, expect, it } from 'vitest'
import { baueLagerplan, parseStellplatz, stellplatzStatus, zellenSchluessel } from '../src/lib/utils/lagerplan'
import type { BestandsPalette, Position } from '../src/types'

const pos = (lagerplatz: string, menge: number, sollMenge: number | null, pruefStatus: Position['pruefStatus'] = 'nicht_noetig') =>
  ({ lagerplatz, menge, sollMenge, pruefStatus }) as Position
const bp = (lagerplatz: string, palettenNummer = 'X') => ({ lagerplatz, palettenNummer }) as BestandsPalette

describe('parseStellplatz', () => {
  it('liest Gasse, Platz und Ebene nach Format', () => {
    expect(parseStellplatz('a-01-2')).toEqual({ gasse: 'A', platz: 1, ebene: 2, id: 'A-01-2' })
    expect(parseStellplatz('A-2-01', 'gasse-ebene-platz')).toMatchObject({ gasse: 'A', platz: 1, ebene: 2 })
  })
  it('liefert null für unbekannte Formen', () => {
    expect(parseStellplatz('Halle 3')).toBeNull()
    expect(parseStellplatz('')).toBeNull()
  })
})

describe('stellplatzStatus', () => {
  it('ist offen ohne Position', () => {
    expect(stellplatzStatus([])).toBe('offen')
  })
  it('ist ok ohne Abweichung', () => {
    expect(stellplatzStatus([pos('A-01-1', 10, 10)])).toBe('ok')
  })
  it('ist abweichung bei anderer Menge als Soll', () => {
    expect(stellplatzStatus([pos('A-01-1', 8, 10)])).toBe('abweichung')
  })
  it('ist nachzaehlen, wenn eine zweite Zählung offen ist, auch vor Abweichung', () => {
    expect(stellplatzStatus([pos('A-01-1', 8, 10, 'offen')])).toBe('nachzaehlen')
  })
})

describe('baueLagerplan', () => {
  it('ordnet Zellen nach Gasse, Ebene und Platz zu und setzt Ebenen von oben nach unten', () => {
    const plan = baueLagerplan([bp('A-01-1'), bp('A-01-2')], [pos('A-01-1', 10, 10)])
    expect(plan.gassen).toEqual(['A'])
    expect(plan.ebenen[0]).toBeGreaterThanOrEqual(5)
    expect(plan.ebenen[plan.ebenen.length - 1]).toBe(1)
    const z = plan.zellen.get(zellenSchluessel('A', 1, 1))!
    expect(z.status).toBe('ok')
    expect(plan.zellen.get(zellenSchluessel('A', 2, 1))?.sollAnzahl).toBe(1)
    expect(plan.zellen.get(zellenSchluessel('A', 2, 1))?.status).toBe('offen')
  })
  it('zählt unlesbare Stellplätze', () => {
    expect(baueLagerplan([bp('Halle 3')], []).unlesbar).toBe(1)
  })
})
