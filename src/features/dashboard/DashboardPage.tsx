import { Link } from 'react-router-dom'
import { AlertTriangle, Boxes, Camera, ChevronRight, ClipboardEdit, Printer, Scale } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Kennzahl, KonfidenzBadge, Leer, Seitenkopf } from '../../components/ui'
import { sollIstAbgleich } from '../../lib/utils/csv'
import { zeitRelativ } from '../../lib/utils/format'
import { fortschrittProGasse } from '../../lib/utils/gasse'

export function DashboardPage() {
  const { aktiveInventur, positionen, artikel, warteschlange, nutzer } = useApp()

  if (!aktiveInventur) {
    return (
      <>
        <Seitenkopf titel="Übersicht" unter={nutzer?.email} />
        <Leer
          icon={<Boxes className="size-7" />}
          titel="Noch keine aktive Inventur"
          text="Lege eine Inventur an, damit du Paletten erfassen kannst."
          aktion={
            <Link to="/inventuren?neu=1" className="btn btn-primary">
              Inventur anlegen
            </Link>
          }
        />
      </>
    )
  }

  const gebinde = positionen.reduce((s, p) => s + p.menge, 0)
  const artikelAnzahl = new Set(positionen.map((p) => p.artikelnummer || p.bezeichnung)).size
  const niedrig = positionen.filter((p) => p.konfidenz === 'niedrig').length
  const abgleich = sollIstAbgleich(positionen, artikel)
  const abweichungen = abgleich.filter((z) => z.differenz !== null && z.differenz !== 0).length
  const bereit = warteschlange.filter((w) => w.inventurId === aktiveInventur.id && w.status === 'bereit').length
  const letzte = positionen.slice(0, 5)

  return (
    <div className="flex flex-col gap-5">
      <div>
        <p className="eyebrow">Aktive Inventur</p>
        <h1 className="mt-1 text-[1.625rem] leading-tight font-bold tracking-tight">{aktiveInventur.name}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {[aktiveInventur.lagerort, aktiveInventur.datum && new Date(aktiveInventur.datum).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}
          {aktiveInventur.status === 'abgeschlossen' && ' · abgeschlossen'}
        </p>
      </div>

      {aktiveInventur.status === 'aktiv' ? (
        <div className="grid grid-cols-[1fr_auto] gap-3">
          <Link to="/erfassen" className="btn btn-primary btn-lg">
            <Camera className="size-6" /> Palette erfassen
          </Link>
          <Link to="/manuell" className="btn btn-secondary btn-lg btn-icon w-[60px]" aria-label="Manuell erfassen">
            <ClipboardEdit className="size-6" />
          </Link>
        </div>
      ) : (
        <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">Diese Inventur ist abgeschlossen. Neue Erfassungen sind nicht möglich.</p>
      )}

      {bereit > 0 && (
        <Link to="/erfassen" className="flex items-center gap-3 rounded-[14px] bg-warn-soft px-4 py-3 text-warn">
          <AlertTriangle className="size-5 shrink-0" />
          <span className="flex-1 text-sm font-semibold">
            {bereit} {bereit === 1 ? 'Palette wartet' : 'Paletten warten'} auf deine Bestätigung
          </span>
          <ChevronRight className="size-5" />
        </Link>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Kennzahl wert={positionen.length} label="Paletten erfasst" ton="accent" />
        <Kennzahl wert={gebinde.toLocaleString('de-DE')} label="Gebinde gesamt" />
        <Kennzahl wert={artikelAnzahl} label="Verschiedene Artikel" />
        <Kennzahl wert={niedrig} label="Niedrige KI Konfidenz" ton={niedrig ? 'bad' : undefined} />
      </div>

      <Link to="/liste?ansicht=abgleich" className="card flex items-center gap-3 px-4 py-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Scale className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Soll/Ist Abgleich</p>
          <p className="text-sm text-ink-2">
            {abweichungen === 0 ? 'Keine Abweichungen zum Sollbestand' : `${abweichungen} ${abweichungen === 1 ? 'Artikel weicht' : 'Artikel weichen'} vom Soll ab`}
          </p>
        </div>
        <ChevronRight className="size-5 text-ink-3" />
      </Link>

      <Link to="/bericht" className="card flex items-center gap-3 px-4 py-4">
        <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
          <Printer className="size-5" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold">Abschlussbericht</p>
          <p className="text-sm text-ink-2">Gassen, Auffälligkeiten und Nachzählungen, als PDF sicherbar</p>
        </div>
        <ChevronRight className="size-5 text-ink-3" />
      </Link>

      {positionen.length > 0 && (
        <section>
          <h2 className="mb-2 font-semibold">Fortschritt nach Gasse</h2>
          <ul className="card divide-y divide-line">
            {fortschrittProGasse(positionen).map((g) => (
              <li key={g.gasse} className="flex items-center gap-3 px-4 py-3">
                <span className="grid size-9 shrink-0 place-items-center rounded-lg bg-surface-2 font-bold">{g.gasse}</span>
                <div className="min-w-0 flex-1">
                  <p className="tabular text-sm font-semibold">
                    {g.paletten} {g.paletten === 1 ? 'Palette' : 'Paletten'}
                  </p>
                  <p className="text-xs text-ink-2">
                    {g.offen} offen · {g.abweichung} Abweichung{g.abweichung === 1 ? '' : 'en'} · {g.eingeschraenkt} eingeschränkt
                  </p>
                </div>
                <span className="tabular text-sm font-bold">{g.menge.toLocaleString('de-DE')}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="font-semibold">Letzte Aktivitäten</h2>
          {positionen.length > 5 && (
            <Link to="/liste" className="text-sm font-semibold text-accent">
              Alle anzeigen
            </Link>
          )}
        </div>
        {letzte.length === 0 ? (
          <p className="card px-4 py-6 text-center text-sm text-ink-2">Noch keine Paletten erfasst. Tippe auf Palette erfassen.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {letzte.map((p) => (
              <li key={p.id}>
                <Link to={`/position/${p.id}`} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{p.bezeichnung || 'Ohne Artikel'}</p>
                    <p className="truncate text-xs text-ink-2">
                      {p.lagerplatz || 'ohne Lagerplatz'} · {zeitRelativ(p.erstelltAm)} · {p.erstelltVon}
                    </p>
                  </div>
                  <span className="tabular text-lg font-bold">{p.menge}</span>
                  <KonfidenzBadge wert={p.konfidenz} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}
