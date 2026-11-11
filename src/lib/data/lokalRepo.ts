import type { Artikel, Inventur, Position } from '../../types'
import { bildOptimieren, blobZuDataUrl } from '../utils/bild'
import { neueId } from '../utils/id'
import type { AuthZustand, DataRepo } from './repo'

/**
 * Lokale Datenhaltung ohne Firebase: Inventuren, Artikel und Positionen bleiben im Speicher dieses Geräts.
 * Mehrere Tabs sehen Änderungen sofort (storage Ereignis).
 * Anmeldung mit Name und Zugangscode, der Code schützt die KI Analyse auf dem Server.
 */

const KEY = 'pz-lokal-v1'
const AUTH_KEY = 'pz-lokal-nutzer'
const CODE_KEY = 'pz-zugangscode'
let codeOhneSpeicher: string | null = null

interface Store {
  inventuren: Inventur[]
  artikel: Artikel[]
  positionen: Record<string, Position[]>
}

const leer = (): Store => ({ inventuren: [], artikel: [], positionen: {} })

function lesen(): Store {
  try {
    const roh = localStorage.getItem(KEY)
    if (roh) return JSON.parse(roh) as Store
  } catch {
    /* localStorage nicht verfügbar */
  }
  return leer()
}

let speicher: Store | null = null
const store = () => (speicher ??= lesen())

function schreibenRoh(s: Store) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s))
  } catch {
    window.dispatchEvent(new CustomEvent('pz-fehler', { detail: 'Der Gerätespeicher der App ist voll. Bitte alte Inventuren exportieren und löschen.' }))
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
function lokalerNutzer(): string | null {
  try {
    return localStorage.getItem(AUTH_KEY) ?? angemeldetOhneSpeicher
  } catch {
    return angemeldetOhneSpeicher
  }
}

const verzoegert = <T,>(wert: T, ms = 120) => new Promise<T>((r) => setTimeout(() => r(wert), ms))

export function createLokalRepo(): DataRepo {
  const email = () => lokalerNutzer() ?? 'unbekannt'
  return {
    art: 'lokal',

    onAuth(cb) {
      const melden = () => {
        const e = lokalerNutzer()
        const z: AuthZustand = e ? { status: 'angemeldet', nutzer: { uid: 'lokal-' + e, email: e } } : { status: 'abgemeldet' }
        cb(z)
      }
      authHoerer.add(melden)
      melden()
      return () => {
        authHoerer.delete(melden)
      }
    },
    async login(mail, passwort) {
      if (!mail.trim()) throw Object.assign(new Error('Name fehlt'), { code: 'auth/missing-name' })
      if (!passwort) throw Object.assign(new Error('Zugangscode fehlt'), { code: 'auth/missing-password' })
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
      // der Zugangscode dient als Token für /api/analyze
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
        cb(
          [...(store().positionen[inventurId] ?? [])]
            .map((p) => ({ ...p, palettenNummer: p.palettenNummer ?? '', charge: p.charge ?? '' }))
            .sort((a, b) => b.erstelltAm - a.erstelltAm),
        ),
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
          erstelltVonUid: 'lokal-' + email(),
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
      // Fotos als kleine Vorschaubilder lokal ablegen (für Liste und Excel Export)
      // nur das erste Foto als Vorschau, damit der Gerätespeicher für viele Paletten reicht
      if (!bilder[0]) return []
      return [await blobZuDataUrl(await bildOptimieren(bilder[0], 360, 0.6))]
    },
  }
}
