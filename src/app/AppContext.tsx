import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react'
import { ladeRepo, type AuthZustand, type DataRepo } from '../lib/data'
import type { Artikel, BestandsMeta, BestandsPalette, Inventur, Nutzer, Position } from '../types'
import { createApiRecognizer, createArtifactRecognizer, type RecognizePallet } from '../features/erfassung/erkennung'
import { onQueue, queueAlle, queueAufraeumen, type QueueEintrag } from '../features/offline/queue'
import { warteschlangeAbarbeiten } from '../features/offline/verarbeitung'

interface Toast {
  id: number
  text: string
  art: 'ok' | 'fehler' | 'info'
}

interface AppWert {
  repo: DataRepo
  auth: AuthZustand
  nutzer: Nutzer | null
  inventuren: Inventur[]
  artikel: Artikel[]
  bestand: BestandsPalette[]
  bestandMeta: BestandsMeta | null
  aktiveInventur: Inventur | null
  aktiveInventurWaehlen(id: string): void
  positionen: Position[]
  positionenGeladen: boolean
  warteschlange: QueueEintrag[]
  erkennen: RecognizePallet
  online: boolean
  toast(text: string, art?: Toast['art']): void
  warteschlangeAnstossen(): void
}

const Ctx = createContext<AppWert | null>(null)

export function useApp(): AppWert {
  const v = useContext(Ctx)
  if (!v) throw new Error('useApp außerhalb des AppProvider')
  return v
}

const AKTIV_KEY = 'pz-aktive-inventur'

function useOnline() {
  const [online, setOnline] = useState(() => navigator.onLine)
  useEffect(() => {
    const an = () => setOnline(true)
    const aus = () => setOnline(false)
    window.addEventListener('online', an)
    window.addEventListener('offline', aus)
    return () => {
      window.removeEventListener('online', an)
      window.removeEventListener('offline', aus)
    }
  }, [])
  return online
}

export function AppProvider({ children, fallback }: { children: ReactNode; fallback: ReactNode }) {
  const [repo, setRepo] = useState<DataRepo | null>(null)
  const [ladeFehler, setLadeFehler] = useState<string | null>(null)
  useEffect(() => {
    ladeRepo()
      .then(setRepo)
      .catch((e) => setLadeFehler(String(e?.message ?? e)))
  }, [])
  if (ladeFehler) return <div className="p-6 text-bad">Die App konnte nicht starten: {ladeFehler}</div>
  if (!repo) return <>{fallback}</>
  return <Innen repo={repo}>{children}</Innen>
}

function Innen({ repo, children }: { repo: DataRepo; children: ReactNode }) {
  const [auth, setAuth] = useState<AuthZustand>({ status: 'laden' })
  const [inventuren, setInventuren] = useState<Inventur[]>([])
  const [artikel, setArtikel] = useState<Artikel[]>([])
  const [bestand, setBestand] = useState<BestandsPalette[]>([])
  const [bestandMeta, setBestandMeta] = useState<BestandsMeta | null>(null)
  const [positionen, setPositionen] = useState<Position[]>([])
  const [positionenGeladen, setPositionenGeladen] = useState(false)
  const [aktivId, setAktivId] = useState<string | null>(() => {
    try {
      return localStorage.getItem(AKTIV_KEY)
    } catch {
      return null
    }
  })
  const [warteschlange, setWarteschlange] = useState<QueueEintrag[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const online = useOnline()
  const nutzer = auth.status === 'angemeldet' ? auth.nutzer : null

  const toast = useCallback((text: string, art: Toast['art'] = 'ok') => {
    const id = Date.now() + Math.random()
    setToasts((t) => [...t.slice(-2), { id, text, art }])
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 3800)
  }, [])

  useEffect(() => {
    const h = (e: Event) => toast(String((e as CustomEvent).detail), 'fehler')
    window.addEventListener('pz-fehler', h)
    return () => window.removeEventListener('pz-fehler', h)
  }, [toast])

  useEffect(() => repo.onAuth(setAuth), [repo])

  const datenFehler = useCallback(
    (e: Error) => toast((e as { code?: string }).code === 'permission-denied' ? 'Keine Berechtigung zum Lesen der Daten.' : 'Daten konnten nicht geladen werden.', 'fehler'),
    [toast],
  )

  useEffect(() => {
    if (!nutzer) return
    const a = repo.onInventuren(setInventuren, datenFehler)
    const b = repo.onArtikel(setArtikel, datenFehler)
    const c = repo.onBestand((l, m) => {
      setBestand(l)
      setBestandMeta(m)
    }, datenFehler)
    return () => {
      a()
      b()
      c()
    }
  }, [repo, nutzer, datenFehler])

  const aktiveInventur = useMemo(() => {
    const gewaehlt = inventuren.find((i) => i.id === aktivId)
    return gewaehlt ?? inventuren.find((i) => i.status === 'aktiv') ?? null
  }, [inventuren, aktivId])

  useEffect(() => {
    setPositionen([])
    setPositionenGeladen(false)
    if (!nutzer || !aktiveInventur) return
    return repo.onPositionen(
      aktiveInventur.id,
      (p) => {
        setPositionen(p)
        setPositionenGeladen(true)
      },
      datenFehler,
    )
  }, [repo, nutzer, aktiveInventur?.id, datenFehler]) // eslint-disable-line react-hooks/exhaustive-deps

  const aktiveInventurWaehlen = useCallback((id: string) => {
    setAktivId(id)
    try {
      localStorage.setItem(AKTIV_KEY, id)
    } catch {
      /* egal */
    }
  }, [])

  const erkennen = useMemo<RecognizePallet>(
    () => (repo.art === 'artifact' ? createArtifactRecognizer() : createApiRecognizer(repo)),
    [repo],
  )

  // Warteschlange beobachten
  useEffect(() => {
    let aktiv = true
    const laden = () => queueAlle().then((l) => aktiv && setWarteschlange(l)).catch(() => undefined)
    laden()
    void queueAufraeumen().catch(() => undefined)
    const ab = onQueue(laden)
    return () => {
      aktiv = false
      ab()
    }
  }, [])

  // Warteschlange automatisch abarbeiten: beim Start, bei Wiederverbindung und regelmäßig
  const artikelRef = useRef(artikel)
  artikelRef.current = artikel
  const laeuft = useRef(false)
  const warteschlangeAnstossen = useCallback(() => {
    if (!nutzer || laeuft.current) return
    laeuft.current = true
    warteschlangeAbarbeiten(repo, erkennen, artikelRef.current)
      .catch(() => undefined)
      .finally(() => {
        laeuft.current = false
      })
  }, [repo, erkennen, nutzer])

  useEffect(() => {
    if (!nutzer) return
    warteschlangeAnstossen()
    const t = setInterval(warteschlangeAnstossen, 20_000)
    const sicht = () => document.visibilityState === 'visible' && warteschlangeAnstossen()
    document.addEventListener('visibilitychange', sicht)
    return () => {
      clearInterval(t)
      document.removeEventListener('visibilitychange', sicht)
    }
  }, [nutzer, warteschlangeAnstossen])

  useEffect(() => {
    if (online) warteschlangeAnstossen()
  }, [online, warteschlangeAnstossen])

  const wert: AppWert = {
    repo,
    auth,
    nutzer,
    inventuren,
    artikel,
    bestand,
    bestandMeta,
    aktiveInventur,
    aktiveInventurWaehlen,
    positionen,
    positionenGeladen,
    warteschlange,
    erkennen,
    online,
    toast,
    warteschlangeAnstossen,
  }

  return (
    <Ctx.Provider value={wert}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 z-50 flex flex-col items-center gap-2 px-4"
        style={{ bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))' }}
        aria-live="polite"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`einblenden card-raised pointer-events-auto max-w-md px-4 py-3 text-sm font-medium ${
              t.art === 'fehler' ? 'text-bad' : t.art === 'info' ? 'text-info' : 'text-ok'
            }`}
            role={t.art === 'fehler' ? 'alert' : 'status'}
          >
            {t.text}
          </div>
        ))}
      </div>
    </Ctx.Provider>
  )
}
