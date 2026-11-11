import { describe, expect, it } from 'vitest'
import { AnalyseAnfrageSchema, base64Bytes, bildSignaturPasst, jsonExtrahieren, kiAntwortValidieren } from '../api/_lib/analyse'

const gueltig = {
  artikel_match: 'D-10025',
  beschreibung: '2 Lagen Kanister 25 l',
  gebindeart: 'Kanister 25 l',
  etikett_text: 'D-10025 Charge 4711',
  stueck_pro_lage: 12,
  lagen: 2,
  fehlende_stueck: 1,
  gesamt_geschaetzt: 23,
  konfidenz: 'hoch',
  hinweise: '',
}
const stamm = ['D-10005', 'D-10025']

describe('kiAntwortValidieren', () => {
  it('akzeptiert gültige JSON Antwort', () => {
    const r = kiAntwortValidieren(JSON.stringify(gueltig), stamm)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ergebnis.artikel_match).toBe('D-10025')
  })
  it('akzeptiert JSON in Markdown Zaun', () => {
    const r = kiAntwortValidieren('Hier:\n```json\n' + JSON.stringify(gueltig) + '\n```', stamm)
    expect(r.ok).toBe(true)
  })
  it('lehnt ungültiges JSON ab', () => {
    const r = kiAntwortValidieren('Ich sehe drei Paletten {lagen: 3', stamm)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/JSON/)
  })
  it('lehnt fehlende Felder ab', () => {
    const { konfidenz: _k, ...ohne } = gueltig
    void _k
    const r = kiAntwortValidieren(JSON.stringify(ohne), stamm)
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.fehler).toMatch(/konfidenz/)
  })
  it('lehnt falsche Datentypen ab', () => {
    expect(kiAntwortValidieren(JSON.stringify({ ...gueltig, lagen: 'viele' }), stamm).ok).toBe(false)
    expect(kiAntwortValidieren(JSON.stringify({ ...gueltig, fehlende_stueck: -1 }), stamm).ok).toBe(false)
    expect(kiAntwortValidieren(JSON.stringify({ ...gueltig, beschreibung: 42 }), stamm).ok).toBe(false)
  })
  it('gleicht kleine Formabweichungen aus', () => {
    const r = kiAntwortValidieren(JSON.stringify({ ...gueltig, lagen: '2', stueck_pro_lage: 12.4, konfidenz: 'High', fehlende_stueck: null, gesamt_geschaetzt: null, hinweise: null }), stamm)
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.ergebnis).toMatchObject({ lagen: 2, stueck_pro_lage: 12, konfidenz: 'hoch', fehlende_stueck: 0, gesamt_geschaetzt: 24, hinweise: '' })
  })
  it('lehnt ungültige Konfidenz ab', () => {
    expect(kiAntwortValidieren(JSON.stringify({ ...gueltig, konfidenz: 'sehr hoch' }), stamm).ok).toBe(false)
  })
  it('ignoriert zusätzliche unbekannte Felder', () => {
    const r = kiAntwortValidieren(JSON.stringify({ ...gueltig, extra: 1 }), stamm)
    expect(r.ok).toBe(true)
    if (r.ok) expect('extra' in r.ergebnis).toBe(false)
  })
  it('verwirft Artikelnummer, die nicht im Stamm ist, und senkt hohe Konfidenz', () => {
    const r = kiAntwortValidieren(JSON.stringify({ ...gueltig, artikel_match: 'X-99999' }), stamm)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.ergebnis.artikel_match).toBeNull()
      expect(r.ergebnis.konfidenz).toBe('mittel')
      expect(r.ergebnis.hinweise).toMatch(/X-99999/)
    }
  })
  it('null Werte für unbekannte Lagen sind erlaubt', () => {
    expect(kiAntwortValidieren(JSON.stringify({ ...gueltig, lagen: null, stueck_pro_lage: null, artikel_match: null }), stamm).ok).toBe(true)
  })
})

describe('Anfrage und Bildprüfung', () => {
  const jpeg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]).toString('base64')
  it('max. drei Bilder', () => {
    const bild = { mediaType: 'image/jpeg', daten: jpeg }
    expect(AnalyseAnfrageSchema.safeParse({ bilder: [bild, bild, bild] }).success).toBe(true)
    expect(AnalyseAnfrageSchema.safeParse({ bilder: [bild, bild, bild, bild] }).success).toBe(false)
    expect(AnalyseAnfrageSchema.safeParse({ bilder: [] }).success).toBe(false)
  })
  it('nur erlaubte Bildtypen', () => {
    expect(AnalyseAnfrageSchema.safeParse({ bilder: [{ mediaType: 'image/gif', daten: jpeg }] }).success).toBe(false)
    expect(AnalyseAnfrageSchema.safeParse({ bilder: [{ mediaType: 'image/jpeg', daten: 'kein base64!' }] }).success).toBe(false)
  })
  it('erkennt Bild Signaturen', () => {
    expect(bildSignaturPasst('image/jpeg', Buffer.from(jpeg, 'base64'))).toBe(true)
    expect(bildSignaturPasst('image/png', Buffer.from(jpeg, 'base64'))).toBe(false)
    expect(bildSignaturPasst('image/jpeg', Buffer.from('<html>'))).toBe(false)
  })
  it('berechnet Base64 Größe', () => {
    expect(base64Bytes(Buffer.alloc(100).toString('base64'))).toBe(100)
    expect(base64Bytes(Buffer.alloc(101).toString('base64'))).toBe(101)
  })
  it('jsonExtrahieren wirft ohne Objekt', () => {
    expect(() => jsonExtrahieren('nichts')).toThrow()
  })
})
