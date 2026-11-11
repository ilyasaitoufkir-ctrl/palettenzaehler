import { useEffect, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Camera, ChevronRight, ClipboardEdit, Images, RefreshCw, ScanLine, Trash2, X } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, Leer, Seitenkopf, Spinner } from '../../components/ui'
import { BildFehler, bildOptimieren } from '../../lib/utils/bild'
import { neueId } from '../../lib/utils/id'
import { zeitRelativ } from '../../lib/utils/format'
import { STATUS_TEXT, queueAktualisieren, queueLoeschen, queueSpeichern, type QueueEintrag, type QueueStatus } from '../offline/queue'
import { analysieren } from '../offline/verarbeitung'

const SLOTS = ['Front', 'Seite', 'Draufsicht'] as const

interface Foto {
  blob: Blob
  url: string
}

const STATUS_CLS: Record<QueueStatus, string> = {
  wartet: 'bg-surface-2 text-ink-2',
  analyse: 'bg-info-soft text-info',
  bereit: 'bg-warn-soft text-warn',
  upload: 'bg-info-soft text-info',
  gespeichert: 'bg-ok-soft text-ok',
  fehler: 'bg-bad-soft text-bad',
}

export function StatusPill({ status }: { status: QueueStatus }) {
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_CLS[status]}`}>
      {(status === 'analyse' || status === 'upload') && <Spinner className="size-3" />}
      {STATUS_TEXT[status]}
    </span>
  )
}

function Vorschau({ eintrag }: { eintrag: QueueEintrag }) {
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    const b = eintrag.bilder[0]
    if (!b) return
    const u = URL.createObjectURL(b)
    setUrl(u)
    return () => URL.revokeObjectURL(u)
  }, [eintrag.bilder])
  return url ? (
    <img src={url} alt="" className="size-14 shrink-0 rounded-xl object-cover" />
  ) : (
    <div className="grid size-14 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3">
      <ScanLine className="size-5" />
    </div>
  )
}

export function ErfassenPage() {
  const { aktiveInventur, warteschlange, artikel, erkennen, online, toast } = useApp()
  const navigate = useNavigate()
  const [fotos, setFotos] = useState<(Foto | null)[]>([null, null, null])
  const [verarbeitet, setVerarbeitet] = useState<number | null>(null)
  const [sendet, setSendet] = useState(false)
  const [loeschen, setLoeschen] = useState<QueueEintrag | null>(null)
  const inputs = useRef<(HTMLInputElement | null)[]>([])
  const mehrereRef = useRef<HTMLInputElement>(null)

  useEffect(
    () => () => {
      fotos.forEach((f) => f && URL.revokeObjectURL(f.url))
    },
    // nur beim Verlassen der Seite aufräumen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  if (!aktiveInventur) {
    return (
      <Leer
        icon={<Camera className="size-7" />}
        titel="Keine aktive Inventur"
        text="Wähle oder lege zuerst eine Inventur an."
        aktion={
          <Link to="/inventuren" className="btn btn-primary">
            Zu den Inventuren
          </Link>
        }
      />
    )
  }
  if (aktiveInventur.status !== 'aktiv') {
    return <Leer icon={<Camera className="size-7" />} titel="Inventur abgeschlossen" text="In einer abgeschlossenen Inventur können keine Paletten erfasst werden." />
  }

  const fotoSetzen = async (i: number, datei: File | undefined) => {
    if (!datei) return
    setVerarbeitet(i)
    try {
      const blob = await bildOptimieren(datei)
      setFotos((alt) => {
        const neu = [...alt]
        if (neu[i]) URL.revokeObjectURL(neu[i]!.url)
        neu[i] = { blob, url: URL.createObjectURL(blob) }
        return neu
      })
    } catch (e) {
      toast(e instanceof BildFehler ? e.message : 'Foto konnte nicht verarbeitet werden.', 'fehler')
    } finally {
      setVerarbeitet(null)
      const inp = inputs.current[i]
      if (inp) inp.value = ''
    }
  }

  /** Mehrere Fotos aus der Mediathek auf einmal in die freien Plätze legen */
  const mehrereSetzen = async (liste: FileList | null) => {
    if (!liste?.length) return
    const frei = fotos.map((f, i) => (f ? -1 : i)).filter((i) => i >= 0)
    const dateien = Array.from(liste).slice(0, frei.length || 3)
    const ziele = frei.length ? frei : [0, 1, 2]
    if (liste.length > ziele.length) toast(`Es passen ${ziele.length} Fotos, die übrigen wurden ignoriert.`, 'info')
    for (const [k, d] of dateien.entries()) await fotoSetzen(ziele[k], d)
    if (mehrereRef.current) mehrereRef.current.value = ''
  }

  const entfernen = (i: number) =>
    setFotos((alt) => {
      const neu = [...alt]
      if (neu[i]) URL.revokeObjectURL(neu[i]!.url)
      neu[i] = null
      return neu
    })

  const vorhandene = fotos.filter((f): f is Foto => !!f)

  const starten = async () => {
    if (!vorhandene.length || sendet) return
    setSendet(true)
    try {
      const id = neueId()
      await queueSpeichern({
        id,
        inventurId: aktiveInventur.id,
        bilder: vorhandene.map((f) => f.blob),
        status: 'wartet',
        fehler: null,
        wiederholbar: true,
        ergebnis: null,
        versuche: 0,
        erstelltAm: Date.now(),
        aktualisiertAm: Date.now(),
      })
      fotos.forEach((f) => f && URL.revokeObjectURL(f.url))
      setFotos([null, null, null])
      if (online) {
        void analysieren(id, erkennen, artikel)
        navigate(`/erfassen/${id}`)
      } else {
        toast('Offline gespeichert. Die Analyse startet automatisch, sobald du wieder online bist.', 'info')
      }
    } catch {
      toast('Fotos konnten auf dem Gerät nicht gespeichert werden.', 'fehler')
    } finally {
      setSendet(false)
    }
  }

  const eintraege = warteschlange.filter((w) => w.inventurId === aktiveInventur.id)

  return (
    <>
      <Seitenkopf
        titel="Palette erfassen"
        unter="Bis zu drei Fotos derselben Palette, mit Kamera oder aus der Mediathek."
        aktion={
          <Link to="/manuell" className="btn btn-secondary">
            <ClipboardEdit className="size-5" /> Manuell
          </Link>
        }
      />

      <div className="grid grid-cols-3 gap-3">
        {SLOTS.map((name, i) => {
          const f = fotos[i]
          return (
            <div key={name} className="min-w-0">
              <div className="relative aspect-[3/4] max-w-full overflow-hidden rounded-[18px] border border-dashed border-line bg-surface">
                {f ? (
                  <>
                    <img src={f.url} alt={`${name} Foto`} className="size-full object-cover" />
                    <button
                      className="absolute top-1.5 right-1.5 grid size-10 place-items-center rounded-full bg-black/55 text-white"
                      onClick={() => entfernen(i)}
                      aria-label={`${name} Foto entfernen`}
                    >
                      <X className="size-5" />
                    </button>
                    <button
                      className="absolute inset-x-1.5 bottom-1.5 min-h-10 rounded-xl bg-black/55 text-xs font-semibold text-white"
                      onClick={() => inputs.current[i]?.click()}
                    >
                      Ersetzen
                    </button>
                  </>
                ) : (
                  <button
                    className={`flex size-full flex-col items-center justify-center gap-2 ${i === 0 ? 'text-accent' : 'text-ink-3'}`}
                    onClick={() => inputs.current[i]?.click()}
                    aria-label={`${name} fotografieren`}
                  >
                    {verarbeitet === i ? <Spinner className="size-7" /> : <Camera className="size-8" />}
                    <span className="text-xs font-semibold">{i === 0 ? 'Foto' : 'Optional'}</span>
                  </button>
                )}
              </div>
              <p className="mt-1.5 text-center text-xs font-medium text-ink-2">{name}</p>
              <input
                ref={(el) => {
                  inputs.current[i] = el
                }}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => fotoSetzen(i, e.target.files?.[0])}
              />
            </div>
          )
        })}
      </div>

      <button className="btn btn-secondary mt-4 w-full" onClick={() => mehrereRef.current?.click()} disabled={verarbeitet !== null}>
        <Images className="size-5" /> Fotos aus Mediathek wählen
      </button>
      <input ref={mehrereRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => mehrereSetzen(e.target.files)} />

      <button className="btn btn-primary btn-lg mt-3 w-full" onClick={starten} disabled={!vorhandene.length || sendet || verarbeitet !== null}>
        {sendet ? <Spinner /> : <ScanLine className="size-6" />}
        {online ? 'Palette analysieren' : 'Offline speichern'}
      </button>
      <p className="mt-2 text-center text-xs text-ink-3">Tipp: ganze Palette im Bild, Etikett lesbar, möglichst ohne Gegenlicht.</p>

      <section className="mt-8">
        <h2 className="mb-2 font-semibold">Erfasste Fotos</h2>
        {eintraege.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-ink-2">Hier erscheinen Paletten, bis sie bestätigt und gespeichert sind.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {eintraege.map((e) => (
              <li key={e.id} className="card flex items-center gap-3 px-3 py-3">
                <Vorschau eintrag={e} />
                <Link to={`/erfassen/${e.id}`} className="min-w-0 flex-1">
                  <StatusPill status={e.status} />
                  <p className="mt-1 truncate text-sm font-medium">
                    {e.ergebnis?.ki.beschreibung ?? `${e.bilder.length || 'Keine'} ${e.bilder.length === 1 ? 'Foto' : 'Fotos'}`}
                  </p>
                  <p className="truncate text-xs text-ink-3">{e.fehler ?? zeitRelativ(e.erstelltAm)}</p>
                </Link>
                {e.status === 'fehler' ? (
                  <button
                    className="btn btn-secondary btn-icon"
                    aria-label="Erneut versuchen"
                    onClick={async () => {
                      await queueAktualisieren(e.id, { status: 'wartet', fehler: null, wiederholbar: true })
                      void analysieren(e.id, erkennen, artikel)
                    }}
                  >
                    <RefreshCw className="size-5" />
                  </button>
                ) : e.status === 'bereit' ? (
                  <Link to={`/erfassen/${e.id}`} className="btn btn-primary btn-icon" aria-label="Bestätigen">
                    <ChevronRight className="size-5" />
                  </Link>
                ) : null}
                {(e.status === 'fehler' || e.status === 'wartet' || e.status === 'bereit' || e.status === 'gespeichert') && (
                  <button className="btn btn-ghost btn-icon" aria-label="Eintrag entfernen" onClick={() => setLoeschen(e)}>
                    <Trash2 className="size-5" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Bestaetigen
        offen={!!loeschen}
        titel={loeschen?.status === 'gespeichert' ? 'Aus der Liste entfernen?' : 'Fotos verwerfen?'}
        text={
          loeschen?.status === 'gespeichert'
            ? 'Die Position bleibt in der Inventur gespeichert. Nur dieser Eintrag verschwindet.'
            : 'Die Fotos dieser Palette werden vom Gerät gelöscht und nicht gespeichert.'
        }
        ja="Entfernen"
        gefaehrlich={loeschen?.status !== 'gespeichert'}
        onNein={() => setLoeschen(null)}
        onJa={async () => {
          if (loeschen) await queueLoeschen(loeschen.id)
          setLoeschen(null)
        }}
      />
    </>
  )
}
