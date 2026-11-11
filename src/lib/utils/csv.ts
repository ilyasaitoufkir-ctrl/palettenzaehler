import type { Artikel, BestandsPalette, Position } from '../../types'
import { nummerNorm } from './gs1'

export const CSV_BOM = '﻿'
const TRENNER = ';'
const ZEILENENDE = '\r\n'

/** Escaping nach RFC 4180, mit Semikolon als Trenner (deutsches Excel) */
export function csvFeld(wert: unknown): string {
  if (wert === null || wert === undefined) return ''
  let s = String(wert)
  // Formel Injection in Excel verhindern
  if (/^[=+\-@\t\r]/.test(s) && !/^-?\d+([.,]\d+)?$/.test(s)) s = "'" + s
  if (/[";\r\n]/.test(s)) return '"' + s.replace(/"/g, '""') + '"'
  return s
}

export function csvAusZeilen(kopf: string[], zeilen: unknown[][]): string {
  const alle = [kopf, ...zeilen].map((z) => z.map(csvFeld).join(TRENNER))
  return CSV_BOM + alle.join(ZEILENENDE) + ZEILENENDE
}

export function zeitstempelDe(ms: number): string {
  const d = new Date(ms)
  const p = (n: number) => String(n).padStart(2, '0')
  return `${p(d.getDate())}.${p(d.getMonth() + 1)}.${d.getFullYear()} ${p(d.getHours())}:${p(d.getMinutes())}`
}

/** Barcode des Artikels, über Artikel ID oder internen Schlüssel gefunden */
export function barcodeFuer(p: Position, artikel: Artikel[]): string {
  const a = (p.artikelId && artikel.find((x) => x.id === p.artikelId)) || artikel.find((x) => p.artikelnummer && x.artikelnummer === p.artikelnummer)
  return a?.barcode ?? ''
}

export const INVENTUR_SPALTEN = [
  'Artikel Barcode',
  'Bezeichnung',
  'Gebindeart',
  'Lagen',
  'Stück pro Lage',
  'Fehlend',
  'Menge',
  'Soll Bestand',
  'Differenz',
  'Lagerplatz',
  'Lagerplatz laut Bestand',
  'Palettennummer',
  'Charge',
  'Konfidenz',
  'Prüfung',
  'Zeitstempel',
  'Erfasst von',
  'Nachgezählt von',
]

export function inventurCsv(positionen: Position[], artikel: Artikel[] = []): string {
  const sortiert = [...positionen].sort((a, b) => a.erstelltAm - b.erstelltAm)
  return csvAusZeilen(
    INVENTUR_SPALTEN,
    sortiert.map((p) => [
      barcodeFuer(p, artikel),
      p.bezeichnung,
      p.gebindeart,
      p.lagen,
      p.stueckProLage,
      p.fehlend,
      p.menge,
      p.sollMenge ?? '',
      p.sollMenge === null ? '' : p.menge - p.sollMenge,
      p.lagerplatz,
      p.lagerplatzLaut,
      p.palettenNummer,
      p.charge,
      p.konfidenz,
      p.pruefStatus === 'offen' ? 'Nachzählung offen' : p.pruefStatus === 'geprueft' ? 'nachgezählt' : 'nicht nötig',
      zeitstempelDe(p.erstelltAm),
      p.erstelltVon,
      p.geprueftVon,
    ]),
  )
}

export interface SollIstZeile {
  artikelnummer: string
  bezeichnung: string
  gebindeart: string
  soll: number | null
  ist: number
  differenz: number | null
  positionen: number
  niedrigeKonfidenz: number
}

/** Summiert die Positionen je Artikel und stellt sie dem Sollbestand gegenüber */
export function sollIstAbgleich(positionen: Position[], artikel: Artikel[]): SollIstZeile[] {
  const map = new Map<string, SollIstZeile>()
  for (const a of artikel) {
    map.set(a.artikelnummer, {
      artikelnummer: a.artikelnummer,
      bezeichnung: a.bezeichnung,
      gebindeart: [a.gebindeart, a.gebindegroesse].filter(Boolean).join(' '),
      soll: a.sollbestand,
      ist: 0,
      differenz: null,
      positionen: 0,
      niedrigeKonfidenz: 0,
    })
  }
  for (const p of positionen) {
    const key = p.artikelnummer || `ohne:${p.bezeichnung}`
    let z = map.get(key)
    if (!z) {
      z = {
        artikelnummer: p.artikelnummer,
        bezeichnung: p.bezeichnung || 'Ohne Zuordnung',
        gebindeart: p.gebindeart,
        soll: null,
        ist: 0,
        differenz: null,
        positionen: 0,
        niedrigeKonfidenz: 0,
      }
      map.set(key, z)
    }
    z.ist += p.menge
    z.positionen += 1
    if (p.konfidenz === 'niedrig') z.niedrigeKonfidenz += 1
  }
  const zeilen = Array.from(map.values()).filter((z) => z.positionen > 0 || z.soll !== null)
  for (const z of zeilen) z.differenz = z.soll === null ? null : z.ist - z.soll
  return zeilen.sort((a, b) => Math.abs(b.differenz ?? 0) - Math.abs(a.differenz ?? 0) || a.artikelnummer.localeCompare(b.artikelnummer))
}

export function sollIstCsv(zeilen: SollIstZeile[]): string {
  return csvAusZeilen(
    ['Bezeichnung', 'Gebinde', 'Soll', 'Ist', 'Differenz', 'Positionen', 'Davon niedrige Konfidenz'],
    zeilen.map((z) => [z.bezeichnung, z.gebindeart, z.soll ?? '', z.ist, z.differenz ?? '', z.positionen, z.niedrigeKonfidenz]),
  )
}

/** Einfacher CSV Parser (Semikolon oder Komma, Anführungszeichen) für den Artikelimport */
export function parseCsv(text: string): string[][] {
  const t = text.replace(/^﻿/, '')
  const ersteZeile = t.split(/\r?\n/, 1)[0] ?? ''
  const trenner = (ersteZeile.match(/;/g)?.length ?? 0) >= (ersteZeile.match(/,/g)?.length ?? 0) ? ';' : ','
  const zeilen: string[][] = []
  let feld = ''
  let zeile: string[] = []
  let inQuotes = false
  for (let i = 0; i < t.length; i++) {
    const c = t[i]
    if (inQuotes) {
      if (c === '"') {
        if (t[i + 1] === '"') {
          feld += '"'
          i++
        } else inQuotes = false
      } else feld += c
    } else if (c === '"') inQuotes = true
    else if (c === trenner) {
      zeile.push(feld)
      feld = ''
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && t[i + 1] === '\n') i++
      zeile.push(feld)
      zeilen.push(zeile)
      zeile = []
      feld = ''
    } else feld += c
  }
  if (feld !== '' || zeile.length) {
    zeile.push(feld)
    zeilen.push(zeile)
  }
  return zeilen.filter((z) => z.some((f) => f.trim() !== ''))
}

export interface ArtikelImportErgebnis {
  artikel: Omit<Artikel, 'id' | 'aktualisiertAm' | 'referenzfotoUrl'>[]
  fehler: string[]
}

const SPALTEN_ALIAS: Record<string, keyof ArtikelImportErgebnis['artikel'][number]> = {
  artikelnummer: 'artikelnummer',
  'artikel-nr': 'artikelnummer',
  artikelnr: 'artikelnummer',
  nummer: 'artikelnummer',
  bezeichnung: 'bezeichnung',
  artikelbezeichnung: 'bezeichnung',
  name: 'bezeichnung',
  gebindeart: 'gebindeart',
  gebinde: 'gebindeart',
  gebindegroesse: 'gebindegroesse',
  gebindegröße: 'gebindegroesse',
  groesse: 'gebindegroesse',
  größe: 'gebindegroesse',
  stueckprolage: 'stueckProLage',
  stückprolage: 'stueckProLage',
  lagenpropalette: 'lagenProPalette',
  barcode: 'barcode',
  ean: 'barcode',
  soll: 'sollbestand',
  sollbestand: 'sollbestand',
}

const normSpalte = (s: string) => s.toLowerCase().replace(/[\s_.]/g, '')

export function artikelAusCsv(text: string): ArtikelImportErgebnis {
  return artikelAusZeilen(parseCsv(text))
}

/** Artikel aus Tabellenzeilen (CSV oder Excel), erste Zeile sind die Spaltennamen */
export function artikelAusZeilen(roh: string[][]): ArtikelImportErgebnis {
  const zeilen = roh.filter((z) => z.some((f) => String(f ?? '').trim() !== ''))
  const fehler: string[] = []
  if (zeilen.length < 2) return { artikel: [], fehler: ['Die Datei enthält keine Datenzeilen.'] }
  const kopf = zeilen[0].map((k) => SPALTEN_ALIAS[normSpalte(k)])
  if (!kopf.includes('bezeichnung')) {
    return { artikel: [], fehler: ['Spalte "Bezeichnung" wird benötigt.'] }
  }
  const zahl = (s: string | undefined) => {
    if (!s || !s.trim()) return null
    const n = Number(s.trim().replace(',', '.'))
    return Number.isInteger(n) && n >= 0 ? n : Number.NaN
  }
  const artikel: ArtikelImportErgebnis['artikel'] = []
  const gesehen = new Set<string>()
  zeilen.slice(1).forEach((z, i) => {
    const get = (k: string) => {
      const idx = kopf.indexOf(k as never)
      return idx >= 0 ? (z[idx] ?? '').trim() : ''
    }
    const bez = get('bezeichnung')
    const barcode = get('barcode')
    // interner Schlüssel: Barcode, sonst Bezeichnung. Er wird nie angezeigt.
    const nr = barcode || bez
    const zeilenNr = i + 2
    if (!bez) {
      fehler.push(`Zeile ${zeilenNr}: Bezeichnung fehlt`)
      return
    }
    if (gesehen.has(nr)) {
      fehler.push(`Zeile ${zeilenNr}: ${bez} doppelt, übersprungen`)
      return
    }
    const spl = zahl(get('stueckProLage'))
    const lpp = zahl(get('lagenProPalette'))
    const soll = zahl(get('sollbestand'))
    if ([spl, lpp, soll].some((v) => Number.isNaN(v))) {
      fehler.push(`Zeile ${zeilenNr}: Zahlenwerte müssen ganze Zahlen ab 0 sein`)
      return
    }
    gesehen.add(nr)
    artikel.push({
      artikelnummer: nr,
      bezeichnung: bez,
      gebindeart: get('gebindeart'),
      gebindegroesse: get('gebindegroesse'),
      stueckProLage: spl,
      lagenProPalette: lpp,
      barcode: get('barcode') || null,
      sollbestand: soll,
    })
  })
  return { artikel, fehler }
}

/** Startet den Download einer Textdatei im Browser */
export function dateiHerunterladen(name: string, inhalt: string, typ = 'text/csv;charset=utf-8') {
  const blob = new Blob([inhalt], { type: typ })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}

const BESTAND_ALIAS: Record<string, keyof Omit<BestandsPalette, 'id'>> = {
  palettennummer: 'palettenNummer',
  palette: 'palettenNummer',
  palettennr: 'palettenNummer',
  nve: 'palettenNummer',
  sscc: 'palettenNummer',
  lenummer: 'palettenNummer',
  le: 'palettenNummer',
  ladeeinheit: 'palettenNummer',
  barcode: 'palettenNummer',
  artikelnummer: 'artikelnummer',
  artikelnr: 'artikelnummer',
  artikel: 'artikelnummer',
  materialnummer: 'artikelnummer',
  material: 'artikelnummer',
  bezeichnung: 'bezeichnung',
  artikelbezeichnung: 'bezeichnung',
  materialkurztext: 'bezeichnung',
  menge: 'menge',
  bestand: 'menge',
  anzahl: 'menge',
  stueck: 'menge',
  stück: 'menge',
  charge: 'charge',
  lot: 'charge',
  chargennummer: 'charge',
  lagerplatz: 'lagerplatz',
  platz: 'lagerplatz',
  lagerort: 'lagerplatz',
}

export interface BestandImportErgebnis {
  paletten: BestandsPalette[]
  fehler: string[]
}

/** Bestandsliste aus Tabellenzeilen (Excel oder CSV), erste Zeile sind die Spaltennamen */
export function bestandAusZeilen(roh: string[][]): BestandImportErgebnis {
  const zeilen = roh.filter((z) => z.some((f) => String(f ?? '').trim() !== ''))
  if (zeilen.length < 2) return { paletten: [], fehler: ['Die Datei enthält keine Datenzeilen.'] }
  const kopf = zeilen[0].map((k) => BESTAND_ALIAS[normSpalte(String(k)).replace(/-/g, '')])
  if (!kopf.includes('palettenNummer')) return { paletten: [], fehler: ['Spalte "Palettennummer" (oder NVE, SSCC, LE-Nummer) wird benötigt.'] }
  const fehler: string[] = []
  const map = new Map<string, BestandsPalette>()
  zeilen.slice(1).forEach((z, i) => {
    const get = (k: string) => {
      const idx = kopf.indexOf(k as never)
      return idx >= 0 ? String(z[idx] ?? '').trim() : ''
    }
    const nr = get('palettenNummer')
    const id = nummerNorm(nr)
    if (!id) return fehler.push(`Zeile ${i + 2}: Palettennummer fehlt`)
    const mengeText = get('menge').replace(',', '.')
    const menge = mengeText === '' ? null : Number(mengeText)
    if (menge !== null && (!Number.isFinite(menge) || menge < 0)) return fehler.push(`Zeile ${i + 2}: Menge ist keine gültige Zahl`)
    if (map.has(id)) fehler.push(`Zeile ${i + 2}: Palette ${nr} doppelt, letzte Zeile gilt`)
    map.set(id, {
      id,
      palettenNummer: nr,
      artikelnummer: get('artikelnummer'),
      bezeichnung: get('bezeichnung'),
      menge: menge === null ? null : Math.round(menge),
      charge: get('charge'),
      lagerplatz: get('lagerplatz'),
    })
  })
  return { paletten: Array.from(map.values()), fehler }
}
