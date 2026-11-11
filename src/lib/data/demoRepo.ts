import type { Artikel, Inventur, Position } from '../../types'
import { bildOptimieren, blobZuDataUrl } from '../utils/bild'
import { neueId } from '../utils/id'
import { KI_ECHT } from '../config'
import type { AuthZustand, DataRepo } from './repo'

/**
 * Demo Datenhaltung: alles bleibt im localStorage dieses Browsers.
 * Mehrere Tabs sehen Änderungen sofort (storage Ereignis), damit sich die Echtzeit Synchronisierung vorführen lässt.
 */

const KEY = 'pz-demo-v1'
const AUTH_KEY = 'pz-demo-auth'
const CODE_KEY = 'pz-zugangscode'
let codeOhneSpeicher: string | null = null

interface Store {
  inventuren: Inventur[]
  artikel: Artikel[]
  positionen: Record<string, Position[]>
}

const TAG = 24 * 60 * 60 * 1000

function seed(): Store {
  // echte KI: ohne Beispieldaten starten
  if (KI_ECHT) return { inventuren: [], artikel: [], positionen: {} }
  const jetzt = Date.now()
  const a = (
    id: string,
    nr: string,
    bez: string,
    art: string,
    gr: string,
    spl: number | null,
    lpp: number | null,
    soll: number | null,
    barcode: string | null,
  ): Artikel => ({
    id,
    artikelnummer: nr,
    bezeichnung: bez,
    gebindeart: art,
    gebindegroesse: gr,
    stueckProLage: spl,
    lagenProPalette: lpp,
    sollbestand: soll,
    barcode,
    referenzfotoUrl: null,
    aktualisiertAm: jetzt,
  })
  const artikel = [
    a('art-1', 'D-10005', 'Orangenöl kaltgepresst', 'Kanister', '5 l', 40, 3, 240, '4000000100051'),
    a('art-2', 'D-10010', 'Vanillearoma natürlich', 'Kanister', '10 l', 20, 2, 120, '4000000100105'),
    a('art-3', 'D-10025', 'Zitronenaroma natürlich', 'Kanister', '25 l', 12, 2, 96, '4000000100259'),
    a('art-4', 'D-20200', 'Pfefferminzöl', 'Fass', '200 l', 4, 1, 12, null),
    a('art-5', 'D-30001', 'Aromamischung Erdbeere', 'IBC', '1000 l', 1, 1, 3, null),
    a('art-6', 'D-50012', 'Leerkanister 25 l', 'Karton', '10 Stück', 5, 4, 60, null),
  ]
  const inv: Inventur = {
    id: 'inv-demo',
    name: 'Beispielinventur Gebäude 5',
    datum: new Date(jetzt).toISOString().slice(0, 10),
    lagerort: 'Gebäude 5, Halle A',
    status: 'aktiv',
    erstelltVon: 'demo@beispiel.de',
    erstelltAm: jetzt - TAG,
  }
  const p = (
    id: string,
    art: Artikel,
    lagen: number,
    spl: number,
    fehlend: number,
    platz: string,
    konf: Position['konfidenz'],
    vorMin: number,
    hinweis: string,
  ): Position => ({
    id,
    inventurId: inv.id,
    artikelId: art.id,
    artikelnummer: art.artikelnummer,
    bezeichnung: art.bezeichnung,
    gebindeart: `${art.gebindeart} ${art.gebindegroesse}`,
    lagen,
    stueckProLage: spl,
    fehlend,
    menge: lagen * spl - fehlend,
    lagerplatz: platz,
    konfidenz: konf,
    quelle: konf === 'manuell' ? 'manuell' : 'ki',
    kiGesamt: konf === 'manuell' ? null : lagen * spl - fehlend,
    kiHinweise: hinweis,
    etikettText: konf === 'manuell' ? null : art.artikelnummer,
    fotoUrls: [],
    erstelltVon: 'demo@beispiel.de',
    erstelltVonUid: 'demo',
    erstelltAm: jetzt - vorMin * 60_000,
    geaendertAm: jetzt - vorMin * 60_000,
    geaendertVon: 'demo@beispiel.de',
  })
  const positionen = [
    p('pos-1', artikel[0], 3, 40, 0, 'A-01-1', 'hoch', 95, 'Beispielposition: volle Palette, alle Seiten sichtbar.'),
    p('pos-2', artikel[0], 3, 40, 6, 'A-01-2', 'mittel', 80, 'Beispielposition: obere Lage angebrochen.'),
    p('pos-3', artikel[1], 2, 20, 0, 'A-02-1', 'hoch', 64, 'Beispielposition: Etikett gut lesbar.'),
    p('pos-4', artikel[2], 2, 12, 3, 'A-03-1', 'niedrig', 40, 'Beispielposition: Folie spiegelt, Kern nicht sichtbar. Bitte nachzählen.'),
    p('pos-5', artikel[3], 1, 4, 0, 'B-01-1', 'manuell', 22, ''),
    p('pos-6', artikel[4], 1, 1, 0, 'B-04-1', 'hoch', 10, 'Beispielposition: ein IBC erkannt.'),
  ]
  return { inventuren: [inv], artikel, positionen: { [inv.id]: positionen } }
}

function lesen(): Store {
  try {
    const roh = localStorage.getItem(KEY)
    if (roh) return JSON.parse(roh) as Store
  } catch {
    /* localStorage nicht verfügbar */
  }
  const s = seed()
  schreibenRoh(s)
  return s
}

let speicher: Store | null = null
const store = () => (speicher ??= lesen())

function schreibenRoh(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    window.dispatchEvent(new CustomEvent('pz-fehler', { detail: 'Der Browserspeicher ist voll. Bitte einige Demo Positionen löschen.' }))
  }
}

type Hoerer = () => void
const hoerer = new Set<Hoerer>()
function aendern(fn: (s: Store) => void) {
  const s = store()
  fn(s)
  schreibenRoh(s)
  hoerer.forEach((h) => h())
}
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      speicher = null
      hoerer.forEach((h) => h())
    }
    if (e.key === AUTH_KEY) authHoerer.forEach((h) => h())
  })
}
function abonnieren(fn: Hoerer) {
  hoerer.add(fn)
  fn()
  return () => {
    hoerer.delete(fn)
  }
}

const authHoerer = new Set<Hoerer>()
let angemeldetOhneSpeicher: string | null = null
function demoNutzer(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY) ?? angemeldetOhneSpeicher
  } catch {
    return angemeldetOhneSpeicher
  }
}

const verzoegert = <T,>(wert: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(wert), ms))

export function demoZuruecksetzen() {
  speicher = seed()
  schreibenRoh(speicher)
  hoerer.forEach((h) => h())
}

export function createDemoRepo(): DataRepo {
  const email = () => demoNutzer() ?? 'demo@beispiel.de'
  return {
    demo: true,
    art: 'demo',

    onAuth(cb) {
      const melden = () => {
        const e = demoNutzer()
        const z: AuthZustand = e ? { status: 'angemeldet', nutzer: { uid: 'demo-' + e, email: e } } : { status: 'abgemeldet' }
        cb(z)
      }
      authHoerer.add(melden)
      melden()
      return () => {
        authHoerer.delete(melden)
      }
    },
    async login(mail, passwort) {
      if (!KI_ECHT && !mail.includes('@')) throw Object.assign(new Error('E-Mail ungültig'), { code: 'auth/invalid-email' })
      if (!passwort) throw Object.assign(new Error('Passwort fehlt'), { code: 'auth/missing-password' })
      await verzoegert(null, 300)
      codeOhneSpeicher = passwort
      try {
        localStorage.setItem(CODE_KEY, passwort)
      } catch {
        /* nur im Speicher */
      }
      try {
        localStorage.setItem(AUTH_KEY, mail.trim())
      } catch {
        angemeldetOhneSpeicher = mail.trim()
      }
      authHoerer.forEach((h) => h())
    },
    async logout() {
      angemeldetOhneSpeicher = null
      codeOhneSpeicher = null
      try {
        localStorage.removeItem(CODE_KEY)
        localStorage.removeItem(AUTH_KEY)
      } catch {
        /* egal */
      }
      authHoerer.forEach((h) => h())
    },
    async passwortZuruecksetzen() {
      await verzoegert(null, 300)
    },
    async idToken() {
      // im Modus "echte KI ohne Firebase" dient der Zugangscode als Token
      let code = codeOhneSpeicher
      try {
        code = localStorage.getItem(CODE_KEY) ?? code
      } catch {
        /* egal */
      }
      return code ? 'code:' + code : null
    },

    onInventuren(cb) {
      return abonnieren(() => cb([...store().inventuren].sort((a, b) => b.datum.localeCompare(a.datum))))
    },
    async inventurAnlegen(e) {
      const id = neueId()
      aendern((s) => {
        s.inventuren.push({ ...e, id, erstelltVon: email(), erstelltAm: Date.now() })
        s.positionen[id] = []
      })
      return id
    },
    async inventurAktualisieren(id, daten) {
      aendern((s) => {
        const i = s.inventuren.find((x) => x.id === id)
        if (i) Object.assign(i, daten)
      })
    },

    onArtikel(cb) {
      return abonnieren(() => cb([...store().artikel].sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer))))
    },
    async artikelSpeichern(id, e) {
      const neu = id ?? neueId()
      aendern((s) => {
        const vorhanden = s.artikel.find((a) => a.id === neu)
        if (vorhanden) Object.assign(vorhanden, e, { aktualisiertAm: Date.now() })
        else s.artikel.push({ ...e, id: neu, referenzfotoUrl: null, aktualisiertAm: Date.now() })
      })
      return neu
    },
    async artikelLoeschen(id) {
      aendern((s) => {
        s.artikel = s.artikel.filter((a) => a.id !== id)
      })
    },
    async artikelImportieren(liste) {
      let neu = 0
      let aktualisiert = 0
      aendern((s) => {
        for (const e of liste) {
          const vorhanden = s.artikel.find((a) => a.artikelnummer === e.artikelnummer)
          if (vorhanden) {
            Object.assign(vorhanden, e, { aktualisiertAm: Date.now() })
            aktualisiert++
          } else {
            s.artikel.push({ ...e, id: neueId(), referenzfotoUrl: null, aktualisiertAm: Date.now() })
            neu++
          }
        }
      })
      return { neu, aktualisiert }
    },
    async referenzfotoHochladen(artikelId, bild) {
      const klein = await bildOptimieren(bild, 480, 0.7)
      const url = await blobZuDataUrl(klein)
      aendern((s) => {
        const a = s.artikel.find((x) => x.id === artikelId)
        if (a) a.referenzfotoUrl = url
      })
      return url
    },

    onPositionen(inventurId, cb) {
      return abonnieren(() =>
        cb([...(store().positionen[inventurId] ?? [])].sort((a, b) => b.erstelltAm - a.erstelltAm)),
      )
    },
    async positionAnlegen(inventurId, positionId, e) {
      aendern((s) => {
        const liste = (s.positionen[inventurId] ??= [])
        const jetzt = Date.now()
        const daten: Position = {
          ...e,
          id: positionId,
          inventurId,
          fotoUrls: [],
          erstelltVon: email(),
          erstelltVonUid: 'demo-' + email(),
          erstelltAm: jetzt,
          geaendertAm: jetzt,
          geaendertVon: email(),
        }
        const idx = liste.findIndex((p) => p.id === positionId)
        if (idx >= 0) liste[idx] = { ...daten, erstelltAm: liste[idx].erstelltAm }
        else liste.push(daten)
      })
    },
    async positionAktualisieren(inventurId, positionId, daten) {
      aendern((s) => {
        const p = s.positionen[inventurId]?.find((x) => x.id === positionId)
        if (p) Object.assign(p, daten, { geaendertAm: Date.now(), geaendertVon: email() })
      })
    },
    async positionLoeschen(inventurId, positionId) {
      aendern((s) => {
        s.positionen[inventurId] = (s.positionen[inventurId] ?? []).filter((p) => p.id !== positionId)
      })
    },
    async fotosHochladen(_inventurId, _positionId, bilder) {
      // im Demo Modus nur kleine Vorschaubilder lokal ablegen
      const urls: string[] = []
      for (const b of bilder) urls.push(await blobZuDataUrl(await bildOptimieren(b, 360, 0.6)))
      return urls
    },
  }
}
