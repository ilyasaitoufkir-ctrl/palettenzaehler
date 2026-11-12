import { describe, expect, it } from 'vitest'
import ExcelJS from 'exceljs'
import { artikelVorlage, excelZeilen, inventurExcel } from '../src/features/export/excel'
import type { Artikel, Inventur, Position } from '../src/types'

const inv: Inventur = { id: 'i', name: 'Gebäude 5', datum: '2026-11-11', lagerort: 'Halle A', status: 'aktiv', erstelltVon: 'x', erstelltAm: 0 }
const pixel = 'data:image/jpeg;base64,/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/wAALCAABAAEBAREA/8QAFAABAAAAAAAAAAAAAAAAAAAACf/EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAD8AKp//2Q=='
const pos = (o: Partial<Position>): Position => ({
  id: 'p', inventurId: 'i', artikelId: null, artikelnummer: 'A-1', bezeichnung: 'Öl', gebindeart: 'Kanister 25 l',
  lagen: 2, stueckProLage: 12, fehlend: 0, menge: 24, lagerplatz: 'A1', konfidenz: 'hoch', quelle: 'ki', kiGesamt: 24,
  kiHinweise: '', etikettText: null, palettenNummer: '', charge: '', sollMenge: null, lagerplatzLaut: '', ebene: '', identitaetUnklar: false, pruefStatus: 'nicht_noetig' as const, geprueftVon: '', geprueftAm: null, protokoll: [], fotoUrls: [pixel], erstelltVon: 'ilo', erstelltVonUid: 'u', erstelltAm: Date.now(), geaendertAm: 0, geaendertVon: '', ...o,
})
const art: Artikel = { id: 'a', artikelnummer: 'A-1', bezeichnung: 'Öl', gebindeart: 'Kanister', gebindegroesse: '25 l', stueckProLage: 12, lagenProPalette: 2, barcode: null, sollbestand: 50, referenzfotoUrl: null, aktualisiertAm: 0 }

describe('Excel Export', () => {
  it('erzeugt Inventur, Soll-Ist und Info Blatt mit Summen und Foto', async () => {
    const blob = await inventurExcel(inv, [pos({ id: '1' }), pos({ id: '2', menge: 20, fehlend: 4, konfidenz: 'niedrig' })], [art], { mitFotos: true })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Inventur', 'Soll-Ist', 'Protokoll', 'Info'])
    const ws = wb.getWorksheet('Inventur')!
    expect(ws.getRow(1).getCell(1).value).toBe('Foto')
    expect(ws.getImages().length).toBe(2)
    const summe = ws.getRow(4).getCell(11).value as { formula: string; result: number }
    expect(summe.formula).toBe('SUM(K2:K3)')
    expect(summe.result).toBe(44)
    const si = wb.getWorksheet('Soll-Ist')!
    expect(si.getRow(2).getCell(4).value).toBe(44)
    expect((si.getRow(2).getCell(5).value as { result: number }).result).toBe(-6)
  })
  it('ohne Fotos keine Foto Spalte', async () => {
    const blob = await inventurExcel(inv, [pos({})], [art], { mitFotos: false })
    const wb = new ExcelJS.Workbook()
    await wb.xlsx.load(await blob.arrayBuffer())
    expect(wb.getWorksheet('Inventur')!.getRow(1).getCell(1).value).toBe('Artikel Barcode')
  })
  it('Vorlage lässt sich wieder einlesen', async () => {
    const zeilen = await excelZeilen(await artikelVorlage())
    expect(zeilen[0]).toContain('Bezeichnung')
    expect(zeilen[0]).not.toContain('Artikelnummer')
  })
})
