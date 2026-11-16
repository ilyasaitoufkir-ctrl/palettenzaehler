import { describe, expect, it } from 'vitest'
import { bestandAusZeilenMitZuordnung, vorschlagZuordnung } from '../src/lib/utils/csv'

describe('vorschlagZuordnung', () => {
  it('erkennt bekannte Spaltennamen', () => {
    expect(vorschlagZuordnung(['Palette', 'Menge', 'Lagerplatz'])).toMatchObject({ palettenNummer: 0, menge: 1, lagerplatz: 2 })
  })
})

describe('bestandAusZeilenMitZuordnung', () => {
  it('liest nach der vom Nutzer gewählten Zuordnung, auch bei unbekannten Spaltennamen', () => {
    const roh = [
      ['Ref', 'Anzahl', 'Platz'],
      ['PAL-DEMO-001', '120', 'A-01-1'],
      ['PAL-DEMO-002', '80', 'A-01-2'],
    ]
    const { paletten, fehler } = bestandAusZeilenMitZuordnung(roh, { palettenNummer: 0, menge: 1, lagerplatz: 2 })
    expect(fehler).toEqual([])
    expect(paletten.map((p) => [p.palettenNummer, p.menge, p.lagerplatz])).toEqual([
      ['PAL-DEMO-001', 120, 'A-01-1'],
      ['PAL-DEMO-002', 80, 'A-01-2'],
    ])
  })

  it('verlangt eine Zuordnung für die Palettennummer', () => {
    const { paletten, fehler } = bestandAusZeilenMitZuordnung([['A'], ['1']], { menge: 0 })
    expect(paletten).toEqual([])
    expect(fehler[0]).toMatch(/Palettennummer/)
  })
})
