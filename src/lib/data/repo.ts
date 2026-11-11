import type { Artikel, ArtikelEingabe, Inventur, InventurEingabe, Nutzer, Position, PositionEingabe } from '../../types'

export type AuthZustand =
  | { status: 'laden' }
  | { status: 'abgemeldet' }
  | { status: 'gesperrt'; email: string }
  | { status: 'angemeldet'; nutzer: Nutzer }

export type Abmelden = () => void

/**
 * Datenzugriff der App: Firebase (gemeinsam fürs Team), lokal (auf dem Gerät) oder als Claude Seite.
 */
export interface DataRepo {
  /** firebase: gemeinsame Daten, lokal: Daten auf dem Gerät, artifact: als Claude Seite veröffentlicht */
  readonly art: 'firebase' | 'lokal' | 'artifact'

  onAuth(cb: (z: AuthZustand) => void): Abmelden
  login(email: string, passwort: string): Promise<void>
  logout(): Promise<void>
  passwortZuruecksetzen(email: string): Promise<void>
  idToken(): Promise<string | null>

  onInventuren(cb: (liste: Inventur[]) => void, fehler?: (e: Error) => void): Abmelden
  inventurAnlegen(eingabe: InventurEingabe): Promise<string>
  inventurAktualisieren(id: string, daten: Partial<InventurEingabe>): Promise<void>

  onArtikel(cb: (liste: Artikel[]) => void, fehler?: (e: Error) => void): Abmelden
  artikelSpeichern(id: string | null, eingabe: ArtikelEingabe): Promise<string>
  artikelLoeschen(id: string): Promise<void>
  /** Legt neue Artikel an oder aktualisiert bestehende (Schlüssel: Artikelnummer) */
  artikelImportieren(liste: ArtikelEingabe[], bestand: Artikel[]): Promise<{ neu: number; aktualisiert: number }>
  referenzfotoHochladen(artikelId: string, bild: Blob): Promise<string>

  onPositionen(inventurId: string, cb: (liste: Position[]) => void, fehler?: (e: Error) => void): Abmelden
  /**
   * Speichert eine Position unter fester ID. Mehrfaches Aufrufen mit derselben ID
   * erzeugt keine Dubletten (idempotent).
   */
  positionAnlegen(inventurId: string, positionId: string, eingabe: PositionEingabe): Promise<void>
  positionAktualisieren(inventurId: string, positionId: string, daten: Partial<PositionEingabe> & { fotoUrls?: string[] }): Promise<void>
  positionLoeschen(inventurId: string, positionId: string): Promise<void>
  fotosHochladen(inventurId: string, positionId: string, bilder: Blob[]): Promise<string[]>
}
