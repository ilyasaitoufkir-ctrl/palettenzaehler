import type { ErkennungsErgebnis } from '../../types'

export type QueueStatus = 'wartet' | 'analyse' | 'bereit' | 'upload' | 'gespeichert' | 'fehler'

export const STATUS_TEXT: Record<QueueStatus, string> = {
  wartet: 'Wartet auf Verbindung',
  analyse: 'Analyse läuft',
  bereit: 'Bereit zur Bestätigung',
  upload: 'Upload läuft',
  gespeichert: 'Erfolgreich gespeichert',
  fehler: 'Fehler, erneuter Versuch erforderlich',
}

export interface QueueEintrag {
  /** zugleich die spätere Positions ID (Idempotenzschlüssel) */
  id: string
  inventurId: string
  bilder: Blob[]
  status: QueueStatus
  fehler: string | null
  /** false bei dauerhaften Fehlern (z. B. fehlende Berechtigung), dann kein automatischer Neuversuch */
  wiederholbar: boolean
  ergebnis: ErkennungsErgebnis | null
  versuche: number
  erstelltAm: number
  aktualisiertAm: number
}

const DB_NAME = 'palettenzaehler'
const STORE = 'warteschlange'

let dbPromise: Promise<IDBDatabase> | null = null
function db(): Promise<IDBDatabase> {
  if (!dbPromise) {
    dbPromise = new Promise((res, rej) => {
      const req = indexedDB.open(DB_NAME, 1)
      req.onupgradeneeded = () => {
        const d = req.result
        if (!d.objectStoreNames.contains(STORE)) d.createObjectStore(STORE, { keyPath: 'id' })
      }
      req.onsuccess = () => res(req.result)
      req.onerror = () => {
        dbPromise = null
        rej(req.error)
      }
    })
  }
  return dbPromise
}

function tx<T>(modus: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T> | void): Promise<T | undefined> {
  return db().then(
    (d) =>
      new Promise<T | undefined>((res, rej) => {
        const t = d.transaction(STORE, modus)
        const s = t.objectStore(STORE)
        const r = fn(s)
        let wert: T | undefined
        if (r) r.onsuccess = () => (wert = r.result)
        t.oncomplete = () => res(wert)
        t.onerror = () => rej(t.error)
        t.onabort = () => rej(t.error)
      }),
  )
}

type Hoerer = () => void
const hoerer = new Set<Hoerer>()
let kanal: BroadcastChannel | null = null
try {
  kanal = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('pz-queue') : null
  if (kanal) kanal.onmessage = () => hoerer.forEach((h) => h())
} catch {
  kanal = null
}
function melden() {
  hoerer.forEach((h) => h())
  kanal?.postMessage('geaendert')
}

export function onQueue(fn: Hoerer): () => void {
  hoerer.add(fn)
  return () => {
    hoerer.delete(fn)
  }
}

export async function queueAlle(): Promise<QueueEintrag[]> {
  const liste = (await tx<QueueEintrag[]>('readonly', (s) => s.getAll() as IDBRequest<QueueEintrag[]>)) ?? []
  return liste.sort((a, b) => b.erstelltAm - a.erstelltAm)
}

export async function queueHolen(id: string): Promise<QueueEintrag | null> {
  return (await tx<QueueEintrag>('readonly', (s) => s.get(id) as IDBRequest<QueueEintrag>)) ?? null
}

export async function queueSpeichern(e: QueueEintrag): Promise<void> {
  await tx('readwrite', (s) => {
    s.put({ ...e, aktualisiertAm: Date.now() })
  })
  melden()
}

export async function queueAktualisieren(id: string, daten: Partial<QueueEintrag>): Promise<QueueEintrag | null> {
  const e = await queueHolen(id)
  if (!e) return null
  const neu = { ...e, ...daten, aktualisiertAm: Date.now() }
  await queueSpeichern(neu)
  return neu
}

export async function queueLoeschen(id: string): Promise<void> {
  await tx('readwrite', (s) => {
    s.delete(id)
  })
  melden()
}

/** Entfernt gespeicherte Einträge, die älter als einen Tag sind */
export async function queueAufraeumen(alterMs = 24 * 60 * 60 * 1000): Promise<void> {
  const grenze = Date.now() - alterMs
  for (const e of await queueAlle()) {
    if (e.status === 'gespeichert' && e.aktualisiertAm < grenze) await queueLoeschen(e.id)
  }
}
