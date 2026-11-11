import { describe, expect, it } from 'vitest'
import { gs1Parsen, nummernVarianten } from '../src/lib/utils/gs1'
import { nachschlagen } from '../src/lib/utils/zuordnung'
import type { Artikel, BestandsPalette } from '../src/types'

const GS = String.fromCharCode(29)
const art = (nr: string, barcode: string | null = null): Artikel => ({
  id: nr, artikelnummer: nr, bezeichnung: 'A ' + nr, gebindeart: 'Kanister', gebindegroesse: '10 l', stueckProLage: 16, lagenProPalette: 2,
  barcode, sollbestand: null, referenzfotoUrl: null, aktualisiertAm: 0,
})
const pal: BestandsPalette = { id: '340123450000012345', palettenNummer: '340123450000012345', artikelnummer: '10025', bezeichnung: 'Chlor flüssig', menge: 32, charge: 'L-2311', lagerplatz: 'A-01-2' }

describe('GS1', () => {
  it('liest NVE, GTIN, Charge und Anzahl aus GS1-128', () => {
    expect(gs1Parsen('00340123450000012345')).toMatchObject({ nve: '340123450000012345' })
    expect(gs1Parsen(`]C10104012345678901${'10'}L-2311${GS}3732`)).toMatchObject({ gtin: '04012345678901', charge: 'L-2311', anzahl: 32 })
    expect(gs1Parsen('(01)04012345678901(10)ABC(37)12')).toMatchObject({ gtin: '04012345678901', charge: 'ABC', anzahl: 12 })
    expect(gs1Parsen('Hallo')).toMatchObject({ nve: null, gtin: null })
  })
  it('erzeugt Varianten mit und ohne führende Nullen', () => {
    expect(nummernVarianten('00340123450000012345')).toContain('340123450000012345')
    expect(nummernVarianten('340123450000012345')).toContain('00340123450000012345')
    expect(nummernVarianten('(01)04012345678901')).toContain('4012345678901')
  })
})

describe('nachschlagen', () => {
  const artikel = [art('10025', '4012345678901'), art('20000', '4000000000001')]
  it('findet Palette im Bestand über gescannte NVE, auch mit AI 00', () => {
    const z = nachschlagen(['00340123450000012345'], [pal], artikel)
    expect(z.palette?.menge).toBe(32)
    expect(z.artikel?.artikelnummer).toBe('10025')
    expect(z.charge).toBe('L-2311')
  })
  it('findet Palette über von der KI abgelesene Nummer mit Leerzeichen', () => {
    expect(nachschlagen(['3401 2345 0000 0123 45'], [pal], artikel).palette?.palettenNummer).toBe('340123450000012345')
  })
  it('fällt auf Artikel Barcode zurück, auch GTIN-14 gegen EAN-13', () => {
    const z = nachschlagen(['(01)04012345678901(10)X9'], [], artikel)
    expect(z.artikel?.artikelnummer).toBe('10025')
    expect(z.charge).toBe('X9')
  })
  it('liefert NVE auch ohne Bestandstreffer', () => {
    const z = nachschlagen(['00999999999999999999'], [], artikel)
    expect(z.palette).toBeNull()
    expect(z.palettenNummer).toBe('999999999999999999')
  })
  it('nichts gefunden', () => {
    expect(nachschlagen(['123'], [pal], artikel)).toMatchObject({ palette: null, artikel: null, grund: null })
  })
})

describe('Bestandsliste Import', () => {
  it('liest typische ERP Spaltennamen', async () => {
    const { bestandAusZeilen } = await import('../src/lib/utils/csv')
    const r = bestandAusZeilen([
      ['NVE', 'Material', 'Materialkurztext', 'Bestand', 'Charge', 'Lagerplatz'],
      ['00340123450000012345', '10025', 'Chlor flüssig', '32', 'L-2311', 'A-01-2'],
      ['3401 2345 0000 0999 99', '10025', 'Chlor flüssig', '16,0', '', 'A-01-3'],
      ['', '1', 'x', '1', '', ''],
    ])
    expect(r.paletten).toHaveLength(2)
    expect(r.paletten[0]).toMatchObject({ id: '00340123450000012345', menge: 32, charge: 'L-2311', lagerplatz: 'A-01-2', artikelnummer: '10025' })
    expect(r.paletten[1]).toMatchObject({ id: '340123450000099999', menge: 16 })
    expect(r.fehler).toHaveLength(1)
  })
  it('verlangt eine Palettennummer Spalte', async () => {
    const { bestandAusZeilen } = await import('../src/lib/utils/csv')
    expect(bestandAusZeilen([['Artikel', 'Menge'], ['1', '2']]).fehler[0]).toMatch(/Palettennummer/)
  })
  it('Bestand mit NVE aus dem Import wird über gescannte Nummer ohne 00 gefunden', async () => {
    const { bestandAusZeilen } = await import('../src/lib/utils/csv')
    const { paletten } = bestandAusZeilen([['Palettennummer', 'Menge'], ['00340123450000012345', '32']])
    expect(nachschlagen(['340123450000012345'], paletten, []).palette?.menge).toBe(32)
  })
})
