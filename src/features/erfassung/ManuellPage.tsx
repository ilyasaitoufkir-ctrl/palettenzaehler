import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ClipboardEdit, Trash2 } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, KonfidenzBadge, Leer } from '../../components/ui'
import { neueId } from '../../lib/utils/id'
import { zeitRelativ } from '../../lib/utils/format'
import { PositionForm } from './PositionForm'
import { startwerte } from './startwerte'

export function ManuellPage() {
  const { aktiveInventur, artikel, bestand, repo, toast } = useApp()
  const navigate = useNavigate()
  const ort = useLocation()
  // vom Barcode Scanner übergebene Werte
  const scan = (ort.state as { scan?: string[] } | null)?.scan ?? []
  const [start] = useState(() => startwerte(scan, null, bestand, artikel))
  // feste ID für diesen Vorgang, ein doppelter Klick legt keine zweite Position an
  const [id] = useState(neueId)

  if (!aktiveInventur || aktiveInventur.status !== 'aktiv') {
    return <Leer icon={<ClipboardEdit className="size-7" />} titel="Keine aktive Inventur" text="Wähle zuerst eine aktive Inventur." />
  }

  return (
    <>
      <h1 className="mb-1 text-[1.625rem] leading-tight font-bold tracking-tight">{scan.length ? 'Gescannte Palette' : 'Manuell erfassen'}</h1>
      <p className="mb-5 text-sm text-ink-2">
        {scan.length ? `Gescannt: ${scan.join(', ')}` : 'Ohne Foto und ohne KI, zum Beispiel bei schlechtem Licht oder ohne Netz.'}
      </p>
      <PositionForm
        artikel={artikel}
        start={start}
        submitText="Position speichern"
        onSubmit={async (e) => {
          await repo.positionAnlegen(aktiveInventur.id, id, e)
          toast(`Position mit ${e.menge} Stück gespeichert`)
          navigate('/liste')
        }}
      />
    </>
  )
}

export function PositionBearbeitenPage() {
  const { id = '' } = useParams()
  const { positionen, positionenGeladen, artikel, repo, toast, aktiveInventur } = useApp()
  const navigate = useNavigate()
  const [loeschen, setLoeschen] = useState(false)
  const p = positionen.find((x) => x.id === id)

  if (!p || !aktiveInventur) {
    return positionenGeladen ? (
      <Leer
        icon={<ClipboardEdit className="size-7" />}
        titel="Position nicht gefunden"
        text="Sie wurde gelöscht oder gehört zu einer anderen Inventur."
        aktion={
          <Link to="/liste" className="btn btn-primary">
            Zur Liste
          </Link>
        }
      />
    ) : null
  }

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Position bearbeiten</h1>
        <KonfidenzBadge wert={p.konfidenz} />
      </div>
      <p className="mb-5 text-sm text-ink-2">
        Erfasst {zeitRelativ(p.erstelltAm)} von {p.erstelltVon}
        {p.geaendertVon && p.geaendertAm - p.erstelltAm > 5000 ? `, zuletzt geändert von ${p.geaendertVon}` : ''}
      </p>
      {p.kiHinweise && <p className="mb-4 rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">KI Hinweis: {p.kiHinweise}</p>}
      <PositionForm
        key={p.id}
        artikel={artikel}
        konfidenzFest={p.konfidenz}
        fotos={p.fotoUrls}
        start={{
          artikelId: p.artikelId && artikel.some((a) => a.id === p.artikelId) ? p.artikelId : null,
          artikelnummer: p.artikelnummer,
          bezeichnung: p.bezeichnung,
          gebindeart: p.gebindeart,
          lagen: p.lagen,
          stueckProLage: p.stueckProLage,
          fehlend: p.fehlend,
          lagerplatz: p.lagerplatz,
          palettenNummer: p.palettenNummer,
          charge: p.charge,
          sollMenge: p.sollMenge,
        }}
        submitText="Änderungen speichern"
        onSubmit={async (e) => {
          // KI Felder der ursprünglichen Erfassung bleiben erhalten
          const { kiGesamt: _k, kiHinweise: _h, etikettText: _e, quelle: _q, ...rest } = e
          void _k
          void _h
          void _e
          void _q
          await repo.positionAktualisieren(aktiveInventur.id, p.id, rest)
          toast('Position aktualisiert')
          navigate('/liste')
        }}
        zusatz={
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Trash2 className="size-5" /> Position löschen
          </button>
        }
      />
      <Bestaetigen
        offen={loeschen}
        titel="Position löschen?"
        text={`${p.bezeichnung || 'Diese Position'} mit ${p.menge} Stück wird aus der Inventur entfernt.`}
        ja="Löschen"
        gefaehrlich
        onNein={() => setLoeschen(false)}
        onJa={async () => {
          await repo.positionLoeschen(aktiveInventur.id, p.id)
          setLoeschen(false)
          toast('Position gelöscht')
          navigate('/liste')
        }}
      />
    </>
  )
}
