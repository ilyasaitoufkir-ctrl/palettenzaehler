import { useState } from 'react'
import { Link, useLocation, useNavigate, useParams } from 'react-router-dom'
import { ClipboardEdit, Trash2 } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, KonfidenzBadge, Leer } from '../../components/ui'
import { neueId } from '../../lib/utils/id'
import { zeitRelativ } from '../../lib/utils/format'
import { darfPruefen, erstErfassungsEingabe, gruendeFuerPosition, nachAenderung } from '../../lib/utils/pruefung'
import type { Position, PositionBasis, Protokolleintrag } from '../../types'
import { PositionForm } from './PositionForm'
import { ladeLagerplatz } from './lagerplatz'
import { startwerte } from './startwerte'

const AKTION_TEXT: Record<Protokolleintrag['aktion'], string> = {
  erfasst: 'Erfasst',
  geaendert: 'Geändert',
  geprueft: 'Nachgezählt',
}

/** Angaben einer Position als Formularwerte, z. B. für die Bestätigung ohne Änderung */
function basisVon(p: Position): PositionBasis {
  return {
    artikelId: p.artikelId,
    artikelnummer: p.artikelnummer,
    bezeichnung: p.bezeichnung,
    gebindeart: p.gebindeart,
    lagen: p.lagen,
    stueckProLage: p.stueckProLage,
    fehlend: p.fehlend,
    menge: p.menge,
    lagerplatz: p.lagerplatz,
    konfidenz: p.konfidenz,
    quelle: p.quelle,
    kiGesamt: p.kiGesamt,
    kiHinweise: p.kiHinweise,
    etikettText: p.etikettText,
    palettenNummer: p.palettenNummer,
    charge: p.charge,
    sollMenge: p.sollMenge,
  }
}

export function ManuellPage() {
  const { aktiveInventur, artikel, bestand, repo, toast, nutzer } = useApp()
  const navigate = useNavigate()
  const ort = useLocation()
  // vom Barcode Scanner übergebene Werte und der aktive Lagerplatz
  const uebergabe = ort.state as { scan?: string[]; platz?: string } | null
  const scan = uebergabe?.scan ?? []
  const [start] = useState(() => startwerte(scan, null, bestand, artikel, uebergabe?.platz ?? ladeLagerplatz()))
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
        onSubmit={async (basis) => {
          await repo.positionAnlegen(aktiveInventur.id, id, erstErfassungsEingabe(basis, start.lagerplatzLaut, nutzer?.email ?? 'unbekannt'))
          toast(`Position mit ${basis.menge} Stück gespeichert`)
          navigate('/liste')
        }}
      />
    </>
  )
}

export function PositionBearbeitenPage() {
  const { id = '' } = useParams()
  const { positionen, positionenGeladen, artikel, repo, toast, aktiveInventur, nutzer } = useApp()
  const nutzerName = nutzer?.email ?? 'unbekannt'
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

  /** speichert Änderungen oder eine Bestätigung und hängt das Protokoll an */
  const speichern = async (werte: PositionBasis, bestaetigen: boolean) => {
    const { kiGesamt: _k, kiHinweise: _h, etikettText: _e, quelle: _q, ...rest } = werte
    void _k
    void _h
    void _e
    void _q
    const pr = nachAenderung(p, { ...werte, lagerplatzLaut: p.lagerplatzLaut }, nutzerName, bestaetigen)
    await repo.positionAktualisieren(aktiveInventur.id, p.id, {
      ...rest,
      pruefStatus: pr.pruefStatus,
      geprueftVon: pr.geprueftVon,
      geprueftAm: pr.geprueftAm,
      protokoll: [...(p.protokoll ?? []), ...pr.eintraege],
    })
  }

  const gruende = gruendeFuerPosition(p)
  const pruefenDarf = darfPruefen(nutzerName, p)

  return (
    <>
      <div className="mb-1 flex items-center justify-between gap-3">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">Position bearbeiten</h1>
        <KonfidenzBadge wert={p.konfidenz} />
      </div>
      <p className="mb-5 text-sm text-ink-2">
        Erfasst {zeitRelativ(p.erstelltAm)} von {p.erstelltVon}
        {p.geaendertVon && p.geaendertAm - p.erstelltAm > 5000 ? `, zuletzt geändert von ${p.geaendertVon}` : ''}
        {p.pruefStatus === 'geprueft' && p.geprueftVon ? `, nachgezählt von ${p.geprueftVon}` : ''}
      </p>

      {p.pruefStatus === 'offen' && (
        <div className="mb-5 rounded-[18px] bg-warn-soft px-4 py-4 text-warn" role="status">
          <p className="font-semibold">Nachzählung offen</p>
          <p className="mt-1 text-sm">{gruende.join(' · ')}</p>
          {pruefenDarf ? (
            <>
              <p className="mt-2 text-sm text-ink">Zähle nach. Stimmen die Angaben, bestätige hier. Weichen sie ab, ändere sie unten.</p>
              <button type="button" className="btn btn-primary mt-3 w-full" onClick={() => speichern(basisVon(p), true)}>
                Nachgezählt, Angaben stimmen
              </button>
            </>
          ) : (
            <p className="mt-2 text-sm text-ink">Eine zweite Person muss nachzählen. Die Erfasserin kann nicht selbst bestätigen.</p>
          )}
        </div>
      )}

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
          lagerplatzLaut: p.lagerplatzLaut,
          palettenNummer: p.palettenNummer,
          charge: p.charge,
          sollMenge: p.sollMenge,
        }}
        submitText="Änderungen speichern"
        onSubmit={async (e) => {
          await speichern(e, false)
          toast('Position aktualisiert')
          navigate('/liste')
        }}
        zusatz={
          <button type="button" className="btn btn-danger" onClick={() => setLoeschen(true)}>
            <Trash2 className="size-5" /> Position löschen
          </button>
        }
      />
      <section className="mt-8">
        <h2 className="mb-2 font-semibold">Protokoll</h2>
        {(p.protokoll ?? []).length === 0 ? (
          <p className="card px-4 py-4 text-sm text-ink-2">Noch keine Einträge.</p>
        ) : (
          <ol className="card divide-y divide-line">
            {(p.protokoll ?? []).map((e, i) => (
              <li key={i} className="px-4 py-3">
                <p className="text-sm font-semibold">
                  {AKTION_TEXT[e.aktion]} · {e.nutzer}
                </p>
                <p className="text-xs text-ink-3">{new Date(e.zeit).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}</p>
                <p className="mt-1 text-sm text-ink-2">{e.details}</p>
              </li>
            ))}
          </ol>
        )}
      </section>

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
