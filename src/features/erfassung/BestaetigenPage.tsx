import { useEffect, useMemo, useState } from 'react'
import { neueId } from '../../lib/utils/id'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { AlertCircle, CheckCircle2, ClipboardEdit, RefreshCw, WifiOff } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Leer, Spinner } from '../../components/ui'
import { queueAktualisieren } from '../offline/queue'
import { analysieren, positionBestaetigen } from '../offline/verarbeitung'
import { erstErfassungsEingabe } from '../../lib/utils/pruefung'
import type { PositionBasis } from '../../types'
import { PositionForm, type KiAnzeige, type PositionStart } from './PositionForm'
import { startwerte } from './startwerte'
import { StatusPill } from './ErfassenPage'

function useObjectUrls(bilder: Blob[] | undefined) {
  const [urls, setUrls] = useState<string[]>([])
  useEffect(() => {
    const u = (bilder ?? []).map((b) => URL.createObjectURL(b))
    setUrls(u)
    return () => u.forEach((x) => URL.revokeObjectURL(x))
  }, [bilder])
  return urls
}

export function BestaetigenPage() {
  const { id = '' } = useParams()
  const { warteschlange, artikel, bestand, repo, erkennen, toast, online, nutzer } = useApp()
  const navigate = useNavigate()
  const eintrag = warteschlange.find((w) => w.id === id)
  const fotos = useObjectUrls(eintrag?.bilder)
  const [manuell, setManuell] = useState(false)

  const ki = eintrag?.ergebnis?.ki
  const start = useMemo<PositionStart>(
    () => startwerte(eintrag?.ergebnis?.barcodeWerte ?? [], ki ?? null, bestand, artikel, eintrag?.lagerplatz ?? ''),
    // nur beim ersten Ergebnis vorbelegen
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eintrag?.ergebnis],
  )

  if (!eintrag) {
    return (
      <Leer
        icon={<AlertCircle className="size-7" />}
        titel="Eintrag nicht gefunden"
        text="Diese Palette wurde bereits verarbeitet oder entfernt."
        aktion={
          <Link to="/erfassen" className="btn btn-primary">
            Zur Erfassung
          </Link>
        }
      />
    )
  }

  const kiAnzeige: KiAnzeige | null = ki
    ? {
        gesamt: ki.gesamt_geschaetzt,
        konfidenz: ki.konfidenz,
        hinweise: ki.hinweise,
        etikett: ki.etikett_text,
        beschreibung: ki.beschreibung,
        barcodeTreffer: null,
        produkt: ki.produkt ?? '',
        barcodeNummern: ki.barcode_nummern ?? [],
      }
    : null

  const fertig = eintrag.status === 'upload' || eintrag.status === 'gespeichert'

  if (fertig) {
    return (
      <div className="flex flex-col items-center gap-4 py-10 text-center">
        <CheckCircle2 className="size-14 text-ok" />
        <div>
          <h1 className="text-2xl font-bold">Position gespeichert</h1>
          <p className="mt-1 text-ink-2">{eintrag.status === 'upload' ? 'Die Fotos werden im Hintergrund hochgeladen.' : 'Alles übertragen.'}</p>
        </div>
        <Link to="/erfassen" className="btn btn-primary btn-lg w-full">
          Nächste Palette
        </Link>
        <Link to="/liste" className="btn btn-ghost">
          Zur Inventurliste
        </Link>
      </div>
    )
  }

  const bestaetigen = async (basis: PositionBasis) => {
    try {
      await positionBestaetigen(repo, eintrag.id, erstErfassungsEingabe(basis, start.lagerplatzLaut, nutzer?.email ?? 'unbekannt'))
      toast(`Position mit ${basis.menge} Stück gespeichert`)
      navigate('/erfassen')
    } catch (err) {
      toast((err as Error).message || 'Speichern fehlgeschlagen.', 'fehler')
    }
  }

  if (eintrag.status === 'bereit' || manuell) {
    return (
      <>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Palette prüfen</h1>
          {!manuell && <StatusPill status={eintrag.status} />}
        </div>
        <PositionForm
          artikel={artikel}
          start={manuell ? { ...start, lagen: null, stueckProLage: null, fehlend: 0 } : start}
          key={manuell ? 'manuell' : 'ki'}
          ki={manuell ? null : kiAnzeige}
          fotos={fotos}
          submitText="Position bestätigen"
          onSubmit={bestaetigen}
          onNeuerArtikel={async (v) => {
            const nr = 'ART-' + neueId()
            const id = await repo.artikelSpeichern(null, {
              artikelnummer: nr,
              bezeichnung: v.bezeichnung,
              gebindeart: v.gebindeart,
              gebindegroesse: '',
              stueckProLage: v.stueckProLage,
              lagenProPalette: null,
              barcode: v.barcode,
              sollbestand: null,
            })
            toast('Artikel angelegt.')
            return id
          }}
        />
      </>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Palette prüfen</h1>
        <StatusPill status={eintrag.status} />
      </div>
      {fotos[0] && <img src={fotos[0]} alt="Palette" className="max-h-72 w-full rounded-[18px] object-cover" />}

      {eintrag.status === 'analyse' && (
        <div className="card flex items-center gap-3 px-4 py-4">
          <Spinner className="size-6 text-accent" />
          <div>
            <p className="font-semibold">Die KI wertet die Fotos aus</p>
            <p className="text-sm text-ink-2">Das dauert meist einige Sekunden.</p>
          </div>
        </div>
      )}
      {eintrag.status === 'wartet' && (
        <div className="card flex items-center gap-3 px-4 py-4">
          <WifiOff className="size-6 text-warn" />
          <div>
            <p className="font-semibold">{online ? 'Wartet auf Analyse' : 'Keine Verbindung'}</p>
            <p className="text-sm text-ink-2">Die Fotos sind auf dem Gerät gesichert. Die Analyse startet automatisch, sobald du online bist.</p>
          </div>
        </div>
      )}
      {eintrag.status === 'fehler' && (
        <div className="rounded-[18px] bg-bad-soft px-4 py-4 text-bad">
          <p className="font-semibold">Analyse fehlgeschlagen</p>
          <p className="mt-1 text-sm">{eintrag.fehler}</p>
          <button
            className="btn btn-secondary mt-3 w-full"
            onClick={async () => {
              await queueAktualisieren(eintrag.id, { status: 'wartet', fehler: null, wiederholbar: true })
              void analysieren(eintrag.id, erkennen, artikel)
            }}
          >
            <RefreshCw className="size-5" /> Erneut versuchen
          </button>
        </div>
      )}

      <button className="btn btn-secondary btn-lg" onClick={() => setManuell(true)}>
        <ClipboardEdit className="size-5" /> Ohne KI manuell erfassen
      </button>
    </div>
  )
}
