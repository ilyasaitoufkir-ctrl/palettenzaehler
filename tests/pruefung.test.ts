import { describe, expect, it } from 'vitest'
import { aenderungen, darfPruefen, ersterfassung, nachAenderung, pruefGruende } from '../src/lib/utils/pruefung'

const basis = { menge: 120, sollMenge: 120, konfidenz: 'hoch' as const, lagerplatz: 'A-01', lagerplatzLaut: 'A-01' }

describe('pruefGruende', () => {
  it('keine Gründe bei Übereinstimmung', () => {
    expect(pruefGruende(basis)).toEqual([])
  })
  it('Mengenabweichung zum Bestand', () => {
    expect(pruefGruende({ ...basis, menge: 118 })).toHaveLength(1)
  })
  it('falscher Lagerplatz zum Bestand', () => {
    expect(pruefGruende({ ...basis, lagerplatz: 'B-02' })[0]).toMatch(/Lagerplatz/)
  })
  it('niedrige KI Konfidenz', () => {
    expect(pruefGruende({ ...basis, konfidenz: 'niedrig' })).toHaveLength(1)
  })
  it('ohne Bestand keine Mengenprüfung', () => {
    expect(pruefGruende({ ...basis, sollMenge: null, lagerplatzLaut: '' })).toEqual([])
  })
})

describe('darfPruefen', () => {
  it('andere Person darf bei offener Prüfung bestätigen', () => {
    expect(darfPruefen('Maria', { erstelltVon: 'ilo', pruefStatus: 'offen' })).toBe(true)
  })
  it('Erfasserin darf nicht selbst bestätigen', () => {
    expect(darfPruefen('Ilo', { erstelltVon: 'ilo', pruefStatus: 'offen' })).toBe(false)
  })
  it('ohne offene Prüfung nichts zu bestätigen', () => {
    expect(darfPruefen('Maria', { erstelltVon: 'ilo', pruefStatus: 'nicht_noetig' })).toBe(false)
  })
})

describe('ersterfassung', () => {
  it('ohne Abweichung nicht_noetig mit Protokoll erfasst', () => {
    const r = ersterfassung({ ...basis, palettenNummer: '', artikelnummer: '100' }, 'ilo', 1)
    expect(r.pruefStatus).toBe('nicht_noetig')
    expect(r.eintraege[0].aktion).toBe('erfasst')
  })
  it('mit Abweichung offen und Grund im Protokoll', () => {
    const r = ersterfassung({ ...basis, menge: 110, palettenNummer: '', artikelnummer: '100' }, 'ilo', 1)
    expect(r.pruefStatus).toBe('offen')
    expect(r.eintraege[0].details).toMatch(/Nachzählung nötig/)
  })
})

describe('nachAenderung', () => {
  const alt = { ...basis, menge: 110, erstelltVon: 'ilo', pruefStatus: 'offen' as const, geprueftVon: '', geprueftAm: null, lagen: 10, stueckProLage: 11, fehlend: 0, palettenNummer: '', charge: '', artikelnummer: '100', bezeichnung: 'Chlor' }

  it('zweite Person bestätigt ohne Änderung', () => {
    const r = nachAenderung(alt, { ...alt, lagen: 10 }, 'maria', true, 5)
    expect(r.pruefStatus).toBe('geprueft')
    expect(r.geprueftVon).toBe('maria')
    expect(r.eintraege.map((e) => e.aktion)).toEqual(['geprueft'])
  })
  it('zweite Person korrigiert: Änderung und Prüfung im Protokoll', () => {
    const r = nachAenderung(alt, { ...alt, menge: 120, lagen: 11, stueckProLage: 11 - 0 }, 'maria', false, 5)
    expect(r.pruefStatus).toBe('geprueft')
    expect(r.eintraege.map((e) => e.aktion)).toEqual(['geaendert', 'geprueft'])
  })
  it('Erfasserin ändert: wieder offen', () => {
    const r = nachAenderung(alt, { ...alt, lagen: 9 }, 'ilo', false, 5)
    expect(r.pruefStatus).toBe('offen')
    expect(r.geprueftVon).toBe('')
  })
  it('Erfasserin bestätigt sich nicht selbst', () => {
    const r = nachAenderung(alt, { ...alt }, 'ilo', true, 5)
    expect(r.pruefStatus).toBe('offen')
  })
  it('Abweichung behoben: nicht mehr nötig', () => {
    const r = nachAenderung(alt, { ...alt, menge: 120, sollMenge: 120 }, 'ilo', false, 5)
    expect(r.pruefStatus).toBe('nicht_noetig')
  })
})

describe('aenderungen', () => {
  it('nennt alt und neu je Feld', () => {
    expect(aenderungen({ menge: 120, lagerplatz: 'A-01' }, { menge: 118, lagerplatz: 'A-01' })).toEqual(['Menge 120 → 118'])
  })
})

describe('Protokoll im Export und Änderungsverlauf', () => {
  it('Protokoll wächst mit jeder Änderung und Bestätigung, nie kürzer', () => {
    const alt = { menge: 110, sollMenge: 120, konfidenz: 'hoch' as const, lagerplatz: 'A-01', lagerplatzLaut: 'A-01', erstelltVon: 'ilo', pruefStatus: 'offen' as const, geprueftVon: '', geprueftAm: null, lagen: 10, stueckProLage: 11, fehlend: 0, palettenNummer: '', charge: '', artikelnummer: '1', bezeichnung: 'x' }
    const erst = ersterfassung({ ...alt, palettenNummer: '', artikelnummer: '1' }, 'ilo', 1)
    const verlauf = [...erst.eintraege]
    const zweite = nachAenderung(alt, { ...alt, menge: 120, lagen: 11 }, 'maria', false, 2)
    verlauf.push(...zweite.eintraege)
    expect(verlauf.map((e) => e.aktion)).toEqual(['erfasst', 'geaendert', 'geprueft'])
    expect(verlauf[2].nutzer).toBe('maria')
  })
})
