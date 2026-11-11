import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
} from 'firebase/auth'
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
  type DocumentData,
  type Timestamp,
} from 'firebase/firestore'
import { getDownloadURL, ref, uploadBytes } from 'firebase/storage'
import { firebase } from '../firebase/client'
import type { Artikel, Inventur, Position } from '../../types'
import type { DataRepo } from './repo'

const ms = (t: unknown): number => {
  if (t && typeof t === 'object' && 'toMillis' in t) return (t as Timestamp).toMillis()
  if (typeof t === 'number') return t
  return Date.now()
}

const ohneUndefined = <T extends object>(o: T): T =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined)) as T

function zuInventur(id: string, d: DocumentData): Inventur {
  return {
    id,
    name: d.name ?? '',
    datum: d.datum ?? '',
    lagerort: d.lagerort ?? '',
    status: d.status === 'abgeschlossen' ? 'abgeschlossen' : 'aktiv',
    erstelltVon: d.erstelltVon ?? '',
    erstelltAm: ms(d.erstelltAm),
  }
}

function zuArtikel(id: string, d: DocumentData): Artikel {
  return {
    id,
    artikelnummer: d.artikelnummer ?? '',
    bezeichnung: d.bezeichnung ?? '',
    gebindeart: d.gebindeart ?? '',
    gebindegroesse: d.gebindegroesse ?? '',
    stueckProLage: d.stueckProLage ?? null,
    lagenProPalette: d.lagenProPalette ?? null,
    barcode: d.barcode ?? null,
    sollbestand: d.sollbestand ?? null,
    referenzfotoUrl: d.referenzfotoUrl ?? null,
    aktualisiertAm: ms(d.aktualisiertAm),
  }
}

function zuPosition(id: string, inventurId: string, d: DocumentData): Position {
  return {
    id,
    inventurId,
    artikelId: d.artikelId ?? null,
    artikelnummer: d.artikelnummer ?? '',
    bezeichnung: d.bezeichnung ?? '',
    gebindeart: d.gebindeart ?? '',
    lagen: d.lagen ?? 0,
    stueckProLage: d.stueckProLage ?? 0,
    fehlend: d.fehlend ?? 0,
    menge: d.menge ?? 0,
    lagerplatz: d.lagerplatz ?? '',
    konfidenz: d.konfidenz ?? 'manuell',
    quelle: d.quelle === 'ki' ? 'ki' : 'manuell',
    kiGesamt: d.kiGesamt ?? null,
    kiHinweise: d.kiHinweise ?? '',
    etikettText: d.etikettText ?? null,
    fotoUrls: Array.isArray(d.fotoUrls) ? d.fotoUrls : [],
    erstelltVon: d.erstelltVon ?? '',
    erstelltVonUid: d.erstelltVonUid ?? '',
    erstelltAm: ms(d.erstelltAm),
    geaendertAm: ms(d.geaendertAm),
    geaendertVon: d.geaendertVon ?? '',
  }
}

/**
 * Firestore Schreibvorgänge werden nicht abgewartet, damit die App offline weiterläuft.
 * Fehler (z. B. fehlende Berechtigung) werden als Ereignis gemeldet und in der Oberfläche angezeigt.
 */
function imHintergrund(p: Promise<unknown>) {
  p.catch((e: unknown) => {
    const text = (e as { code?: string }).code === 'permission-denied' ? 'Keine Berechtigung für diese Änderung.' : 'Speichern fehlgeschlagen. Bitte erneut versuchen.'
    window.dispatchEvent(new CustomEvent('pz-fehler', { detail: text }))
  })
}

function nutzerEmail(): { uid: string; email: string } {
  const u = firebase().auth.currentUser
  if (!u) throw new Error('Nicht angemeldet.')
  return { uid: u.uid, email: u.email ?? '' }
}

export function createFirebaseRepo(): DataRepo {
  const { auth, db, storage } = firebase()

  return {
    demo: false,

    onAuth(cb) {
      cb({ status: 'laden' })
      return onAuthStateChanged(auth, async (u) => {
        if (!u) return cb({ status: 'abgemeldet' })
        try {
          const profil = await getDoc(doc(db, 'users', u.uid))
          if (!profil.exists()) return cb({ status: 'gesperrt', email: u.email ?? '' })
        } catch (e) {
          // offline: Freischaltung nicht prüfbar, die Security Rules schützen die Daten weiterhin
          if ((e as { code?: string }).code === 'permission-denied') return cb({ status: 'gesperrt', email: u.email ?? '' })
        }
        cb({ status: 'angemeldet', nutzer: { uid: u.uid, email: u.email ?? '' } })
      })
    },
    async login(email, passwort) {
      await signInWithEmailAndPassword(auth, email.trim(), passwort)
    },
    async logout() {
      await signOut(auth)
    },
    async passwortZuruecksetzen(email) {
      await sendPasswordResetEmail(auth, email.trim())
    },
    async idToken() {
      return (await auth.currentUser?.getIdToken()) ?? null
    },

    onInventuren(cb, fehler) {
      const q = query(collection(db, 'inventuren'), orderBy('datum', 'desc'))
      return onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => zuInventur(d.id, d.data({ serverTimestamps: 'estimate' })))),
        (e) => fehler?.(e),
      )
    },
    async inventurAnlegen(e) {
      const ref_ = doc(collection(db, 'inventuren'))
      const { email } = nutzerEmail()
      // nicht awaiten: offline bleibt der Schreibvorgang im lokalen Cache und wird später übertragen
      imHintergrund(setDoc(ref_, { ...e, erstelltVon: email, erstelltAm: serverTimestamp() }))
      return ref_.id
    },
    async inventurAktualisieren(id, daten) {
      imHintergrund(updateDoc(doc(db, 'inventuren', id), ohneUndefined(daten)))
    },

    onArtikel(cb, fehler) {
      const q = query(collection(db, 'artikel'), orderBy('artikelnummer'))
      return onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => zuArtikel(d.id, d.data({ serverTimestamps: 'estimate' })))),
        (e) => fehler?.(e),
      )
    },
    async artikelSpeichern(id, e) {
      const ref_ = id ? doc(db, 'artikel', id) : doc(collection(db, 'artikel'))
      imHintergrund(setDoc(ref_, { ...e, aktualisiertAm: serverTimestamp() }, { merge: true }))
      return ref_.id
    },
    async artikelLoeschen(id) {
      imHintergrund(deleteDoc(doc(db, 'artikel', id)))
    },
    async artikelImportieren(liste, bestand) {
      const nachNr = new Map(bestand.map((a) => [a.artikelnummer, a.id]))
      let neu = 0
      let aktualisiert = 0
      // Firestore erlaubt max. 500 Operationen je Batch
      for (let i = 0; i < liste.length; i += 450) {
        const batch = writeBatch(db)
        for (const a of liste.slice(i, i + 450)) {
          const vorhandeneId = nachNr.get(a.artikelnummer)
          const r = vorhandeneId ? doc(db, 'artikel', vorhandeneId) : doc(collection(db, 'artikel'))
          if (vorhandeneId) aktualisiert++
          else neu++
          batch.set(r, { ...a, aktualisiertAm: serverTimestamp() }, { merge: true })
        }
        await batch.commit()
      }
      return { neu, aktualisiert }
    },
    async referenzfotoHochladen(artikelId, bild) {
      const r = ref(storage, `artikel/${artikelId}/referenz.jpg`)
      await uploadBytes(r, bild, { contentType: 'image/jpeg' })
      const url = await getDownloadURL(r)
      await updateDoc(doc(db, 'artikel', artikelId), { referenzfotoUrl: url })
      return url
    },

    onPositionen(inventurId, cb, fehler) {
      const q = query(collection(db, 'inventuren', inventurId, 'positionen'), orderBy('erstelltAm', 'desc'))
      return onSnapshot(
        q,
        (snap) => cb(snap.docs.map((d) => zuPosition(d.id, inventurId, d.data({ serverTimestamps: 'estimate' })))),
        (e) => fehler?.(e),
      )
    },
    async positionAnlegen(inventurId, positionId, e) {
      const { uid, email } = nutzerEmail()
      // feste ID: wiederholtes Speichern überschreibt dieselbe Position statt eine Dublette anzulegen
      imHintergrund(setDoc(doc(db, 'inventuren', inventurId, 'positionen', positionId), {
        ...e,
        fotoUrls: [],
        erstelltVon: email,
        erstelltVonUid: uid,
        erstelltAm: serverTimestamp(),
        geaendertAm: serverTimestamp(),
        geaendertVon: email,
      }))
    },
    async positionAktualisieren(inventurId, positionId, daten) {
      const { email } = nutzerEmail()
      imHintergrund(updateDoc(doc(db, 'inventuren', inventurId, 'positionen', positionId), {
        ...ohneUndefined(daten),
        geaendertAm: serverTimestamp(),
        geaendertVon: email,
      }))
    },
    async positionLoeschen(inventurId, positionId) {
      imHintergrund(deleteDoc(doc(db, 'inventuren', inventurId, 'positionen', positionId)))
    },
    async fotosHochladen(inventurId, positionId, bilder) {
      const urls: string[] = []
      for (const [i, b] of bilder.entries()) {
        const r = ref(storage, `inventuren/${inventurId}/${positionId}/foto-${i + 1}.jpg`)
        await uploadBytes(r, b, { contentType: 'image/jpeg' })
        urls.push(await getDownloadURL(r))
      }
      return urls
    },
  }
}
