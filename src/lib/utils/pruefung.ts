import type { Position, PositionEingabe, PositionsKonfidenz, Protokolleintrag, PruefStatus } from '../../types'

/**
 * Vier Augen Prinzip und Protokoll. Reine Funktionen ohne Speicher,
 * damit die Regeln einzeln getestet werden können.
 */

/** Felder, die für Protokoll und Änderungsvergleich zählen */
const FELDER: { key: 'artikelnummer' | 'bezeichnung' | 'lagen' | 'stueckProLage' | 'fehlend' | 'menge' | 'lagerplatz' | 'palettenNummer' | 'charge' | 'ebene' | 'identitaetUnklar'; label: string }[] = [
  { key: 'artikelnummer', label: 'Artikel' },
  { key: 'bezeichnung', label: 'Bezeichnung' },
  { key: 'lagen', label: 'Lagen' },
  { key: 'stueckProLage', label: 'Stück pro Lage' },
  { key: 'fehlend', label: 'Fehlend' },
  { key: 'menge', label: 'Menge' },
  { key: 'lagerplatz', label: 'Lagerplatz' },
  { key: 'palettenNummer', label: 'Palettennummer' },
  { key: 'charge', label: 'Charge' },
  { key: 'ebene', label: 'Ebene' },
  { key: 'identitaetUnklar', label: 'Identität unklar' },
]

/** Ab dieser Ebene wird nur gesichtet, nicht gezählt. Ebene 5 entspricht dem obersten Regalfach. */
export const SICHTPRUEFUNG_AB_EBENE = 5

/** Angaben, aus denen die Prüfregeln abgeleitet werden */
export interface PruefAngaben {
  menge: number
  sollMenge: number | null
  konfidenz: PositionsKonfidenz
  lagerplatz: string
  lagerplatzLaut: string
  ebene?: string
  identitaetUnklar?: boolean
}

const gleichePerson = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase()

const wert = (v: unknown) => (v === '' || v === null || v === undefined ? '–' : String(v))

/** Gründe, warum eine zweite Zählung nötig ist. Leer heißt: keine Prüfung nötig. */
export function pruefGruende(p: PruefAngaben): string[] {
  const g: string[] = []
  if (p.sollMenge !== null && p.menge !== p.sollMenge) g.push(`Menge weicht vom Bestand ab (Soll ${p.sollMenge}, Ist ${p.menge})`)
  if (p.lagerplatzLaut && p.lagerplatz && p.lagerplatz !== p.lagerplatzLaut) {
    g.push(`Lagerplatz weicht vom Bestand ab (Soll ${p.lagerplatzLaut}, Ist ${p.lagerplatz})`)
  }
  if (p.konfidenz === 'niedrig') g.push('KI Konfidenz niedrig')
  if (p.identitaetUnklar) g.push('Identität unklar, Etikett nicht eindeutig lesbar')
  if (p.ebene && Number(p.ebene) >= SICHTPRUEFUNG_AB_EBENE) g.push(`Ebene ${p.ebene}, nur Sichtprüfung`)
  return g
}

/** Darf dieser Nutzer die Position bestätigen? Nur die zweite Person, nie die Erfasserin selbst. */
export function darfPruefen(nutzer: string, p: { erstelltVon: string; pruefStatus: PruefStatus }): boolean {
  return p.pruefStatus === 'offen' && !!nutzer && !gleichePerson(nutzer, p.erstelltVon)
}

/** Vergleicht zwei Angabenstände und liefert lesbare Zeilen, z. B. "Menge 120 → 118" */
export function aenderungen(alt: Partial<Record<(typeof FELDER)[number]['key'], unknown>>, neu: Partial<Record<(typeof FELDER)[number]['key'], unknown>>): string[] {
  return FELDER.filter((f) => String(alt[f.key] ?? '') !== String(neu[f.key] ?? '')).map((f) => `${f.label} ${wert(alt[f.key])} → ${wert(neu[f.key])}`)
}

/** Kurzfassung einer neuen Erfassung für das Protokoll */
export function zusammenfassung(p: { menge: number; lagerplatz: string; palettenNummer: string; artikelnummer: string }): string {
  return `Menge ${p.menge}, Lagerplatz ${wert(p.lagerplatz)}, Palettennummer ${wert(p.palettenNummer)}, Artikel ${wert(p.artikelnummer)}`
}

export function eintrag(aktion: Protokolleintrag['aktion'], nutzer: string, details: string, zeit = Date.now()): Protokolleintrag {
  return { zeit, nutzer, aktion, details }
}

export interface PruefErgebnis {
  pruefStatus: PruefStatus
  geprueftVon: string
  geprueftAm: number | null
  /** neue Protokolleinträge, die an das bestehende Protokoll angehängt werden */
  eintraege: Protokolleintrag[]
}

/** Ersterfassung: entscheidet über den Prüfstatus und schreibt den ersten Protokolleintrag */
export function ersterfassung(p: PruefAngaben & { palettenNummer: string; artikelnummer: string }, nutzer: string, zeit = Date.now()): PruefErgebnis {
  const gruende = pruefGruende(p)
  const details = [zusammenfassung(p), ...(gruende.length ? [`Nachzählung nötig: ${gruende.join('; ')}`] : [])].join(' · ')
  return {
    pruefStatus: gruende.length ? 'offen' : 'nicht_noetig',
    geprueftVon: '',
    geprueftAm: null,
    eintraege: [eintrag('erfasst', nutzer, details, zeit)],
  }
}

/**
 * Änderung oder Bestätigung einer bestehenden Position.
 * - Ändert die Erfasserin etwas, wird die Prüfung wieder offen.
 * - Ändert oder bestätigt eine zweite Person, gilt die Position als geprüft.
 */
export function nachAenderung(
  alt: PruefAngaben & { erstelltVon: string; pruefStatus: PruefStatus; geprueftVon: string; geprueftAm: number | null } & Partial<Record<(typeof FELDER)[number]['key'], unknown>>,
  neu: PruefAngaben & Partial<Record<(typeof FELDER)[number]['key'], unknown>>,
  nutzer: string,
  bestaetigen: boolean,
  zeit = Date.now(),
): PruefErgebnis {
  const aend = aenderungen(alt, neu)
  const gruende = pruefGruende(neu)
  const eintraege: Protokolleintrag[] = []
  if (aend.length) eintraege.push(eintrag('geaendert', nutzer, aend.join(', '), zeit))

  const zweitePerson = !gleichePerson(nutzer, alt.erstelltVon)
  // zweite Person bestätigt oder korrigiert: die Nachzählung gilt als erledigt, auch wenn die Abweichung dabei verschwindet
  if (zweitePerson && alt.pruefStatus !== 'nicht_noetig' && (aend.length || bestaetigen)) {
    eintraege.push(eintrag('geprueft', nutzer, aend.length ? 'Nachgezählt und korrigiert' : 'Nachgezählt, Angaben bestätigt', zeit))
    return { pruefStatus: 'geprueft', geprueftVon: nutzer, geprueftAm: zeit, eintraege }
  }
  // keine Prüfung mehr nötig
  if (!gruende.length) {
    return { pruefStatus: 'nicht_noetig', geprueftVon: '', geprueftAm: null, eintraege }
  }
  // Erfasserin ändert etwas: erneute Nachzählung nötig
  if (aend.length) return { pruefStatus: 'offen', geprueftVon: '', geprueftAm: null, eintraege }
  // nichts geändert, Status bleibt, nur offen falls vorher nicht gesetzt
  const status: PruefStatus = alt.pruefStatus === 'nicht_noetig' ? 'offen' : alt.pruefStatus
  return { pruefStatus: status, geprueftVon: alt.geprueftVon, geprueftAm: alt.geprueftAm, eintraege }
}

/** Hilfsfunktion für Anzeige: Gründe einer bestehenden Position */
export function gruendeFuerPosition(p: Pick<Position, 'menge' | 'sollMenge' | 'konfidenz' | 'lagerplatz' | 'lagerplatzLaut'>): string[] {
  return pruefGruende(p)
}

/** Vollständige Eingabe für eine neue Position, inkl. Prüfstatus und erstem Protokolleintrag */
export function erstErfassungsEingabe(
  basis: Omit<PositionEingabe, 'lagerplatzLaut' | 'pruefStatus' | 'geprueftVon' | 'geprueftAm' | 'protokoll'>,
  lagerplatzLaut: string,
  nutzer: string,
): PositionEingabe {
  const pr = ersterfassung({ ...basis, lagerplatzLaut }, nutzer)
  return { ...basis, lagerplatzLaut, pruefStatus: pr.pruefStatus, geprueftVon: '', geprueftAm: null, protokoll: pr.eintraege }
}
