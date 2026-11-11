import { describe, expect, it } from 'vitest'
import { CSV_BOM, artikelAusCsv, csvFeld, inventurCsv, parseCsv, sollIstAbgleich, sollIstCsv } from '../src/lib/utils/csv'
import type { Artikel, Position } from '../src/types'

const pos = (over: Partial<Position>): Position => ({
  id: 'p',
  inventurId: 'i',
  artikelId: null,
  artikelnummer: 'A-1',
  bezeichnung: 'Öl',
  gebindeart: 'Kanister 5 l',
  lagen: 1,
  stueckProLage: 1,
  fehlend: 0,
  menge: 1,
  lagerplatz: 'A1',
  konfidenz: 'hoch',
  quelle: 'ki',
  kiGesamt: 1,
  kiHinweise: '',
  etikettText: null, palettenNummer: '', charge: '', sollMenge: null,
  lagerplatzLaut: '', pruefStatus: 'nicht_noetig' as const, geprueftVon: '', geprueftAm: null, protokoll: [], 
  fotoUrls: [],
  erstelltVon: 'a@b.de',
  erstelltVonUid: 'u',
  erstelltAm: new Date(2026, 10, 11, 9, 5).getTime(),
  geaendertAm: 0,
  geaendertVon: '',
  ...over,
})

describe('CSV Export', () => {
  it('beginnt mit UTF-8 BOM und nutzt Semikolon', () => {
    const csv = inventurCsv([pos({})])
    expect(csv.startsWith(CSV_BOM)).toBe(true)
    expect(csv.slice(1).split('\r\n')[0]).toBe('Artikelnummer;Bezeichnung;Gebindeart;Menge;Lagerplatz;Palettennummer;Charge;Konfidenz;Zeitstempel;Nutzer;Prüfung;Nachgezählt von')
    expect(csv).toContain('A-1;Öl;Kanister 5 l;1;A1;;;hoch;11.11.2026 09:05;a@b.de;nicht nötig;')
  })
  it('erhält Umlaute', () => {
    expect(inventurCsv([pos({ bezeichnung: 'Pfefferminzöl Größe ß' })])).toContain('Pfefferminzöl Größe ß')
  })
  it('escaped Semikolons, Anführungszeichen und Zeilenumbrüche', () => {
    expect(csvFeld('a;b')).toBe('"a;b"')
    expect(csvFeld('Sie sagte "hallo"')).toBe('"Sie sagte ""hallo"""')
    expect(csvFeld('Zeile1\nZeile2')).toBe('"Zeile1\nZeile2"')
    const csv = inventurCsv([pos({ bezeichnung: 'Aroma; "Spezial"\nneu' })])
    expect(csv).toContain('"Aroma; ""Spezial""\nneu"')
    // Rundreise: der Parser liest es identisch zurück
    const zeilen = parseCsv(csv)
    expect(zeilen[1][1]).toBe('Aroma; "Spezial"\nneu')
  })
  it('verhindert Formel Injection, lässt negative Zahlen in Ruhe', () => {
    expect(csvFeld('=SUMME(A1)')).toBe("'=SUMME(A1)")
    expect(csvFeld('-5')).toBe('-5')
    expect(csvFeld(null)).toBe('')
  })
})

describe('Soll/Ist Abgleich', () => {
  const art = (nr: string, soll: number | null): Artikel => ({
    id: nr,
    artikelnummer: nr,
    bezeichnung: nr,
    gebindeart: 'Kanister',
    gebindegroesse: '5 l',
    stueckProLage: null,
    lagenProPalette: null,
    barcode: null,
    sollbestand: soll,
    referenzfotoUrl: null,
    aktualisiertAm: 0,
  })
  it('summiert je Artikel und berechnet Differenz', () => {
    const z = sollIstAbgleich(
      [pos({ artikelnummer: 'A', menge: 100 }), pos({ artikelnummer: 'A', menge: 14, konfidenz: 'niedrig' }), pos({ artikelnummer: 'B', menge: 5 })],
      [art('A', 120), art('B', 5), art('C', 10), art('D', null)],
    )
    const a = z.find((x) => x.artikelnummer === 'A')!
    expect(a).toMatchObject({ ist: 114, soll: 120, differenz: -6, positionen: 2, niedrigeKonfidenz: 1 })
    expect(z.find((x) => x.artikelnummer === 'C')).toMatchObject({ ist: 0, differenz: -10 })
    expect(z.find((x) => x.artikelnummer === 'D')).toBeUndefined()
    expect(z[0].artikelnummer).toBe('C')
    expect(sollIstCsv(z).startsWith(CSV_BOM)).toBe(true)
  })
})

describe('Artikel CSV Import', () => {
  it('liest Semikolon Datei mit BOM und deutschen Spaltennamen', () => {
    const r = artikelAusCsv('﻿Artikelnummer;Bezeichnung;Gebindeart;Gebindegröße;Stück pro Lage;Sollbestand\nA-1;Orangenöl;Kanister;5 l;40;240\nA-2;"Vanille; natürlich";Kanister;10 l;;')
    expect(r.fehler).toEqual([])
    expect(r.artikel).toHaveLength(2)
    expect(r.artikel[0]).toMatchObject({ artikelnummer: 'A-1', stueckProLage: 40, sollbestand: 240, gebindegroesse: '5 l' })
    expect(r.artikel[1]).toMatchObject({ bezeichnung: 'Vanille; natürlich', stueckProLage: null })
  })
  it('meldet fehlende Pflichtspalten, Dubletten und ungültige Zahlen', () => {
    expect(artikelAusCsv('Name;Menge\nx;1').fehler[0]).toMatch(/Artikelnummer/)
    const r = artikelAusCsv('Artikelnummer,Bezeichnung,Soll\nA,Eins,5\nA,Doppelt,3\nB,Zwei,-4\n,Leer,1')
    expect(r.artikel).toHaveLength(1)
    expect(r.fehler).toHaveLength(3)
  })
})

describe('Artikel aus Excel Zeilen', () => {
  it('nutzt dieselbe Logik wie der CSV Import', async () => {
    const { artikelAusZeilen } = await import('../src/lib/utils/csv')
    const r = artikelAusZeilen([
      ['Artikelnummer', 'Bezeichnung', 'Stück pro Lage', 'Lagen pro Palette', 'Sollbestand'],
      ['10025', 'Zitronenaroma', '12', '2', '96'],
      ['', '', '', '', ''],
    ])
    expect(r.fehler).toEqual([])
    expect(r.artikel[0]).toMatchObject({ artikelnummer: '10025', stueckProLage: 12, lagenProPalette: 2, sollbestand: 96 })
  })
})
