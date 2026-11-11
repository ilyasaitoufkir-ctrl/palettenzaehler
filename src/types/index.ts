export type Konfidenz = 'hoch' | 'mittel' | 'niedrig'
export type PositionsKonfidenz = Konfidenz | 'manuell'

export interface Nutzer {
  uid: string
  email: string
}

export type InventurStatus = 'aktiv' | 'abgeschlossen'

export interface Inventur {
  id: string
  name: string
  /** ISO Datum JJJJ-MM-TT */
  datum: string
  lagerort: string
  status: InventurStatus
  erstelltVon: string
  erstelltAm: number
}

export type InventurEingabe = Pick<Inventur, 'name' | 'datum' | 'lagerort' | 'status'>

export interface Artikel {
  id: string
  artikelnummer: string
  bezeichnung: string
  /** z. B. Kanister, Karton, Fass, IBC */
  gebindeart: string
  /** z. B. 25 l */
  gebindegroesse: string
  stueckProLage: number | null
  lagenProPalette: number | null
  /** optionaler Barcode Inhalt (EAN, GS1, interne Nummer) */
  barcode: string | null
  /** optionaler Sollbestand in Stück für den Soll/Ist Abgleich */
  sollbestand: number | null
  referenzfotoUrl: string | null
  aktualisiertAm: number
}

export type ArtikelEingabe = Omit<Artikel, 'id' | 'aktualisiertAm' | 'referenzfotoUrl'>

export type PositionsQuelle = 'ki' | 'manuell'

export interface Position {
  id: string
  inventurId: string
  artikelId: string | null
  artikelnummer: string
  bezeichnung: string
  gebindeart: string
  lagen: number
  stueckProLage: number
  fehlend: number
  menge: number
  lagerplatz: string
  konfidenz: PositionsKonfidenz
  quelle: PositionsQuelle
  /** Gesamtmenge laut KI, nur zur Nachvollziehbarkeit */
  kiGesamt: number | null
  kiHinweise: string
  etikettText: string | null
  /** abgelesene Palettennummer (Palettenschein, NVE/SSCC) */
  palettenNummer: string
  /** abgelesene oder eingetragene Charge/Lot */
  charge: string
  fotoUrls: string[]
  erstelltVon: string
  erstelltVonUid: string
  erstelltAm: number
  geaendertAm: number
  geaendertVon: string
}

export type PositionEingabe = Omit<
  Position,
  'id' | 'inventurId' | 'erstelltVon' | 'erstelltVonUid' | 'erstelltAm' | 'geaendertAm' | 'geaendertVon' | 'fotoUrls'
>

/** Ergebnis der KI Analyse, bereits serverseitig validiert */
export interface KiErgebnis {
  artikel_match: string | null
  beschreibung: string
  gebindeart: string
  etikett_text: string | null
  produkt: string
  paletten_nummer: string | null
  barcode_nummern: string[]
  charge: string | null
  stueck_pro_lage: number | null
  lagen: number | null
  fehlende_stueck: number
  gesamt_geschaetzt: number
  konfidenz: Konfidenz
  hinweise: string
}

export interface ErkennungsErgebnis {
  ki: KiErgebnis
  /** per Barcode erkannte Artikelnummer, falls das Gerät BarcodeDetector unterstützt */
  barcodeArtikelnummer: string | null
  barcodeWerte: string[]
}
