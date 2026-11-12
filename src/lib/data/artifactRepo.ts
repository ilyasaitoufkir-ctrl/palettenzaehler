import type { Artikel, BestandsMeta, BestandsPalette, Inventur, Position, Protokolleintrag } from '../../types'
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
  get?(): Promise<DocSnap & { exists: boolean }>
  onSnapshot?(next: (s: DocSnap & { exists: boolean }) => void, err?: (e: { code: string; message: string }) => void): Unsub
  set(d: Record<string, unknown>): Promise<void>
  update(d: Record<string, unknown>): Promise<void>
  delete(): Promise<void>
}
interface CollRef {
  doc(id?: string): DocRef
  get?(): Promise<QuerySnap>
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
    async inventurLoeschen(id) {
      const pos = (await db!.collection(pfadPositionen(id)).get?.())?.docs ?? []
      for (const d of pos) await db!.doc(`${pfadPositionen(id)}/${d.id}`).delete()
      await db!.doc(`inventuren/${id}`).delete()
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

    onBestand(cb, fehler) {
      let liste: BestandsPalette[] = []
      let meta: BestandsMeta | null = null
      const a = abonnieren<BestandsPalette>(
        db!.collection('bestand'),
        (id, d) => ({
          id,
          palettenNummer: str(d.palettenNummer),
          artikelnummer: str(d.artikelnummer),
          bezeichnung: str(d.bezeichnung),
          menge: numN(d.menge),
          charge: str(d.charge),
          lagerplatz: str(d.lagerplatz),
        }),
        (l) => {
          liste = l
          cb(liste, meta)
        },
        fehler,
      )
      const b =
        db!.doc('einstellungen/bestand').onSnapshot?.((d) => {
          const x = d.data()
          meta = x ? { importiertAm: num(x.importiertAm), quelle: str(x.quelle), anzahl: num(x.anzahl) } : null
          cb(liste, meta)
        }) ?? (() => undefined)
      return () => {
        a()
        b()
      }
    },
    async bestandErsetzen(liste, quelle) {
      const alt = (await db!.collection('bestand').get?.())?.docs ?? []
      const neu = new Set(liste.map((p) => p.id))
      for (const d of alt) if (!neu.has(d.id)) await db!.doc(`bestand/${d.id}`).delete()
      for (const p of liste) await db!.doc(`bestand/${p.id}`).set(sauber(p))
      await db!.doc('einstellungen/bestand').set({ importiertAm: Date.now(), quelle, anzahl: liste.length })
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
          palettenNummer: str(d.palettenNummer),
          charge: str(d.charge),
          sollMenge: numN(d.sollMenge),
          lagerplatzLaut: str(d.lagerplatzLaut),
          ebene: str(d.ebene),
          identitaetUnklar: d.identitaetUnklar === true,
          pruefStatus: d.pruefStatus === 'offen' || d.pruefStatus === 'geprueft' ? d.pruefStatus : 'nicht_noetig',
          geprueftVon: str(d.geprueftVon),
          geprueftAm: numN(d.geprueftAm),
          protokoll: Array.isArray(d.protokoll)
            ? d.protokoll.filter((x): x is Protokolleintrag => !!x && typeof x === 'object').map((x) => ({ zeit: num(x.zeit), nutzer: str(x.nutzer), aktion: x.aktion, details: str(x.details) }))
            : [],
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
