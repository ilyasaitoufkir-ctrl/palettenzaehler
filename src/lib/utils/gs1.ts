/**
 * Barcode Inhalte auswerten: GS1 Application Identifier (NVE/SSCC, GTIN, Charge, Anzahl)
 * und Nummern so normalisieren, dass sie mit der Bestandsliste vergleichbar sind.
 */

export interface Gs1Daten {
  nve: string | null
  gtin: string | null
  charge: string | null
  anzahl: number | null
}

const GS = String.fromCharCode(29)

/** feste Längen der wichtigsten GS1 AIs (ohne AI selbst); null = variabel bis GS */
const AI_LAENGE: Record<string, number | null> = {
  '00': 18,
  '01': 14,
  '02': 14,
  '10': null,
  '11': 6,
  '13': 6,
  '15': 6,
  '17': 6,
  '21': null,
  '37': null,
  '400': null,
}

export function gs1Parsen(rohIn: string): Gs1Daten {
  const leer: Gs1Daten = { nve: null, gtin: null, charge: null, anzahl: null }
  let roh = rohIn.trim().replace(/^\]C1|^\]d2|^\]Q3|^\]e0/, '')
  // Klammerschreibweise (00)3401... in Fließtext umwandeln
  if (/^\(\d{2,4}\)/.test(roh)) roh = roh.replace(/\((\d{2,4})\)/g, (_m, ai, off) => (off === 0 ? ai : GS + ai))
  if (!/^\d/.test(roh)) return leer
  const d = { ...leer }
  let i = 0
  let schritte = 0
  while (i < roh.length && schritte++ < 12) {
    const ai = ['400', ...Object.keys(AI_LAENGE).filter((k) => k.length === 2)].find((k) => roh.startsWith(k, i))
    if (!ai) break
    i += ai.length
    const laenge = AI_LAENGE[ai]
    let wert: string
    if (laenge) {
      wert = roh.slice(i, i + laenge)
      i += laenge
      if (roh[i] === GS) i++
    } else {
      const ende = roh.indexOf(GS, i)
      wert = ende < 0 ? roh.slice(i) : roh.slice(i, ende)
      i = ende < 0 ? roh.length : ende + 1
    }
    if (ai === '00' && /^\d{18}$/.test(wert)) d.nve = wert
    else if ((ai === '01' || ai === '02') && /^\d{14}$/.test(wert)) d.gtin = wert
    else if (ai === '10') d.charge = wert
    else if (ai === '37' && /^\d+$/.test(wert)) d.anzahl = Number(wert)
  }
  return d
}

/** Vergleichsform einer Nummer: ohne Leerzeichen, Bindestriche, Klammern und Groß/Klein Unterschiede */
export function nummerNorm(s: string | null | undefined): string {
  return String(s ?? '')
    .replace(/^\]C1|^\]d2|^\]Q3/, '')
    .replace(/[\s\-()./]/g, '')
    .replace(new RegExp(GS, 'g'), '')
    .toUpperCase()
}

/**
 * Alle sinnvollen Schreibweisen einer gelesenen Nummer, damit z. B. eine NVE mit oder ohne
 * führende "00" und eine GTIN-14 auch als EAN-13 gefunden wird.
 */
export function nummernVarianten(roh: string): string[] {
  const v = new Set<string>()
  const n = nummerNorm(roh)
  if (n) v.add(n)
  const g = gs1Parsen(roh)
  if (g.nve) {
    v.add(g.nve)
    v.add('00' + g.nve)
  }
  if (g.gtin) {
    v.add(g.gtin)
    if (g.gtin.startsWith('0')) v.add(g.gtin.slice(1))
  }
  if (/^00\d{18}$/.test(n)) v.add(n.slice(2))
  if (/^\d{18}$/.test(n)) v.add('00' + n)
  if (/^0\d{13}$/.test(n)) v.add(n.slice(1))
  if (/^\d{13}$/.test(n)) v.add('0' + n)
  return Array.from(v)
}
