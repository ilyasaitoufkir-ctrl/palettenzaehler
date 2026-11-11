import type { Artikel, Inventur, Position } from '../../types'
import { bildOptimieren } from '../utils/bild'
import { neueId } from '../utils/id'
import type { DataRepo } from './repo'

/**
 * Datenhaltung als veröffentlichte Claude Seite:
 * gemeinsame Datenbank (db), Anmeldung über das Claude Konto (user), Fotos als Assets.
 * Alle, mit denen die Seite geteilt ist, sehen dieselbe Inventur in Echtzeit.
 */

type Unsub = () => void
interface DocSnap {
  id: string
  data(): Record<string, unknown> | undefined
}
interface QuerySnap {
  docs: DocSnap[]
}
interface DocRef {
  set(d: Record<string, unknown>): Promise<void>
  update(d: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
}
interface CollRef {
  doc(id?: string): DocRef
  onSnapshot(next: (s: QuerySnap) => void, err?: (e: { code: string; message: string }) => void): Unsub
}
interface DB {
  collection(path: string): CollRef
  doc(path: string): DocRef
}
interface UserCap {
  me(): Promise<{ id: string | null; name: string; email: string | null }>
}
interface AssetsCap {
  upload(b: Blob): Promise<{ id: string; url: string }>
}
interface ClaudeGlobal {
  use(name: string): Promise<unknown>
}

export function claudeGlobal(): ClaudeGlobal | null {
  return (globalThis as unknown as { claude?: ClaudeGlobal }).claude ?? null
}

async function use<T>(name: string): Promise<T | null> {
  const c = claudeGlobal()
  if (!c) return null
  try {
    return ((await c.use(name)) as T) ?? null
  } catch {
    return null
  }
}

const fehlerMelden = (text: string) => window.dispatchEvent(new CustomEvent('pz-fehler', { detail: text }))

function schreibfehler(e: unknown) {
  const code = (e as { code?: string })?.code
  fehlerMelden(
    code === 'not_granted'
      ? 'Du hast nur Leserechte. Bitte die Besitzerin oder den Besitzer der Seite um Bearbeitungsrechte.'
      : code === 'quota_exceeded' || code === 'resource_exhausted'
        ? 'Speicherlimit erreicht.'
        : 'Speichern fehlgeschlagen. Bitte erneut versuchen.',
  )
}

/** Datenbank Werte dürfen kein undefined enthalten */
const sauber = (o: object) => JSON.parse(JSON.stringify(o)) as Record<string, unknown>

function abonnieren<T>(
  coll: CollRef,
  map: (id: string, d: Record<string, unknown>) => T,
  cb: (l: T[]) => void,
  fehler?: (e: Error) => void,
): Unsub {
  let geladen = false
  const timer = setTimeout(() => {
    if (!geladen) fehler?.(Object.assign(new Error('Zeitüberschreitung beim Laden'), { code: 'timeout' }))
  }, 10_000)
  const ab = coll.onSnapshot(
    (s) => {
      geladen = true
      clearTimeout(timer)
      cb(s.docs.map((d) => map(d.id, d.data() ?? {})))
    },
    (e) => {
      clearTimeout(timer)
      fehler?.(Object.assign(new Error(e.message), { code: e.code === 'not_granted' ? 'permission-denied' : e.code }))
    },
  )
  return () => {
    clearTimeout(timer)
    ab()
  }
}

const str = (v: unknown) => (typeof v === 'string' ? v : '')
const num = (v: unknown, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : d)
const numN = (v: unknown) => (typeof v === 'number' && Number.isFinite(v) ? v : null)

export async function createArtifactRepo(): Promise<DataRepo> {
  const [db, user, assets] = await Promise.all([use<DB>('db'), use<UserCap>('user'), use<AssetsCap>('assets')])
  let ich: { uid: string; email: string } | null = null
  if (user) {
    const me = await user.me().catch(() => null)
    if (me?.id) ich = { uid: me.id, email: me.email || me.name || 'Teammitglied' }
  }
  const nutzer = () => {
    if (!ich) throw new Error('Nicht angemeldet.')
    return ich
  }
  const pfadPositionen = (inv: string) => `inventuren/${inv}/positionen`

  return {
    demo: false,
    art: 'artifact',

    onAuth(cb) {
      if (!db || !ich) cb({ status: 'gesperrt', email: '' })
      else cb({ status: 'angemeldet', nutzer: ich })
      return () => undefined
    },
    async login() {},
    async logout() {},
    async passwortZuruecksetzen() {},
    async idToken() {
      return null
    },

    onInventuren(cb, fehler) {
      return abonnieren<Inventur>(
        db!.collection('inventuren'),
        (id, d) => ({
          id,
          name: str(d.name),
          datum: str(d.datum),
          lagerort: str(d.lagerort),
          status: d.status === 'abgeschlossen' ? 'abgeschlossen' : 'aktiv',
          erstelltVon: str(d.erstelltVon),
          erstelltAm: num(d.erstelltAm),
        }),
        (l) => cb(l.sort((a, b) => b.datum.localeCompare(a.datum) || b.erstelltAm - a.erstelltAm)),
        fehler,
      )
    },
    async inventurAnlegen(e) {
      const id = neueId()
      db!.doc(`inventuren/${id}`).set(sauber({ ...e, erstelltVon: nutzer().email, erstelltAm: Date.now() })).catch(schreibfehler)
      return id
    },
    async inventurAktualisieren(id, daten) {
      db!.doc(`inventuren/${id}`).update(sauber(daten)).catch(schreibfehler)
    },

    onArtikel(cb, fehler) {
      return abonnieren<Artikel>(
        db!.collection('artikel'),
        (id, d) => ({
          id,
          artikelnummer: str(d.artikelnummer),
          bezeichnung: str(d.bezeichnung),
          gebindeart: str(d.gebindeart),
          gebindegroesse: str(d.gebindegroesse),
          stueckProLage: numN(d.stueckProLage),
          lagenProPalette: numN(d.lagenProPalette),
          barcode: str(d.barcode) || null,
          sollbestand: numN(d.sollbestand),
          referenzfotoUrl: str(d.referenzfotoUrl) || null,
          aktualisiertAm: num(d.aktualisiertAm),
        }),
        (l) => cb(l.sort((a, b) => a.artikelnummer.localeCompare(b.artikelnummer, 'de', { numeric: true }))),
        fehler,
      )
    },
    async artikelSpeichern(id, e) {
      const neu = id ?? neueId()
      const ref = db!.doc(`artikel/${neu}`)
      const daten = sauber({ ...e, aktualisiertAm: Date.now() })
      ;(id ? ref.update(daten) : ref.set({ ...daten, referenzfotoUrl: null })).catch(schreibfehler)
      return neu
    },
    async artikelLoeschen(id) {
      db!.doc(`artikel/${id}`).delete().catch(schreibfehler)
    },
    async artikelImportieren(liste, bestand) {
      const nachNr = new Map(bestand.map((a) => [a.artikelnummer, a.id]))
      let neu = 0
      let aktualisiert = 0
      for (const a of liste) {
        const vorhanden = nachNr.get(a.artikelnummer)
        if (vorhanden) {
          aktualisiert++
          await db!.doc(`artikel/${vorhanden}`).update(sauber({ ...a, aktualisiertAm: Date.now() }))
        } else {
          neu++
          await db!.doc(`artikel/${neueId()}`).set(sauber({ ...a, referenzfotoUrl: null, aktualisiertAm: Date.now() }))
        }
      }
      return { neu, aktualisiert }
    },
    async referenzfotoHochladen(artikelId, bild) {
      if (!assets) throw new Error('Foto Upload ist für dein Konto auf dieser Seite nicht freigegeben.')
      const { url } = await assets.upload(await bildOptimieren(bild, 800, 0.8))
      await db!.doc(`artikel/${artikelId}`).update({ referenzfotoUrl: url })
      return url
    },

    onPositionen(inventurId, cb, fehler) {
      return abonnieren<Position>(
        db!.collection(pfadPositionen(inventurId)),
        (id, d) => ({
          id,
          inventurId,
          artikelId: str(d.artikelId) || null,
          artikelnummer: str(d.artikelnummer),
          bezeichnung: str(d.bezeichnung),
          gebindeart: str(d.gebindeart),
          lagen: num(d.lagen),
          stueckProLage: num(d.stueckProLage),
          fehlend: num(d.fehlend),
          menge: num(d.menge),
          lagerplatz: str(d.lagerplatz),
          konfidenz: (['hoch', 'mittel', 'niedrig', 'manuell'] as const).find((k) => k === d.konfidenz) ?? 'manuell',
          quelle: d.quelle === 'ki' ? 'ki' : 'manuell',
          kiGesamt: numN(d.kiGesamt),
          kiHinweise: str(d.kiHinweise),
          etikettText: str(d.etikettText) || null,
          fotoUrls: Array.isArray(d.fotoUrls) ? d.fotoUrls.filter((u): u is string => typeof u === 'string') : [],
          erstelltVon: str(d.erstelltVon),
          erstelltVonUid: str(d.erstelltVonUid),
          erstelltAm: num(d.erstelltAm),
          geaendertAm: num(d.geaendertAm),
          geaendertVon: str(d.geaendertVon),
        }),
        (l) => cb(l.sort((a, b) => b.erstelltAm - a.erstelltAm)),
        fehler,
      )
    },
    async positionAnlegen(inventurId, positionId, e) {
      const { uid, email } = nutzer()
      const jetzt = Date.now()
      // feste ID: wiederholtes Speichern überschreibt dieselbe Position statt eine Dublette anzulegen
      db!
        .doc(`${pfadPositionen(inventurId)}/${positionId}`)
        .set(sauber({ ...e, fotoUrls: [], erstelltVon: email, erstelltVonUid: uid, erstelltAm: jetzt, geaendertAm: jetzt, geaendertVon: email }))
        .catch(schreibfehler)
    },
    async positionAktualisieren(inventurId, positionId, daten) {
      db!
        .doc(`${pfadPositionen(inventurId)}/${positionId}`)
        .update(sauber({ ...daten, geaendertAm: Date.now(), geaendertVon: nutzer().email }))
        .catch(schreibfehler)
    },
    async positionLoeschen(inventurId, positionId) {
      db!.doc(`${pfadPositionen(inventurId)}/${positionId}`).delete().catch(schreibfehler)
    },
    async fotosHochladen(_inventurId, _positionId, bilder) {
      if (!assets) return []
      const urls: string[] = []
      for (const b of bilder) urls.push((await assets.upload(await bildOptimieren(b, 1200, 0.8))).url)
      return urls
    },
  }
}
