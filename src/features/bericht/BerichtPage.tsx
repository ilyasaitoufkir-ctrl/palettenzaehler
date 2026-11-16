import { useState } from 'react'
import { sollBekannt } from '../../lib/utils/soll'
import { Link } from 'react-router-dom'
import { Printer } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Kennzahl, Leer } from '../../components/ui'
import { fortschrittProGasse } from '../../lib/utils/gasse'
import { pruefGruende, schwelleVon, SICHTPRUEFUNG_AB_EBENE } from '../../lib/utils/pruefung'
import { nachzaehlCsv, nachzaehlListe } from '../../lib/utils/nachzaehl'
import { dateiHerunterladen } from '../../lib/utils/csv'
import { dateinameSicher } from '../../lib/utils/format'
import { differenzlisteCsv, ladeDiffFelder, type DiffFeld } from '../../lib/utils/differenzliste'
import { DifferenzlisteSheet } from './DifferenzlisteSheet'

const STATUS_TEXT = {
  nicht_noetig: '–',
  offen: 'Nachzählung offen',
  geprueft: 'Nachgezählt',
} as const

const zeit = (t: number) => new Date(t).toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })

/** Abschlussbericht der aktiven Inventur. Über den Browser als PDF speicherbar (Drucken, dann "Als PDF sichern"). */
export function BerichtPage() {
  const { aktiveInventur, positionen, bestand } = useApp()
  const schwelle = schwelleVon(aktiveInventur)
  const nachzaehlen = nachzaehlListe(positionen, schwelle)
  const [diffOffen, setDiffOffen] = useState(false)
  const sollDa = sollBekannt(bestand, positionen)

  if (!aktiveInventur) {
    return (
      <Leer
        icon={<Printer className="size-7" />}
        titel="Keine aktive Inventur"
        text="Wähle eine Inventur aus, dann kannst du ihren Bericht erstellen."
        aktion={
          <Link to="/inventuren" className="btn btn-primary">
            Zu den Inventuren
          </Link>
        }
      />
    )
  }

  const ist = positionen.reduce((s, p) => s + p.menge, 0)
  const mitSoll = positionen.filter((p) => p.sollMenge !== null)
  const soll = mitSoll.reduce((s, p) => s + (p.sollMenge ?? 0), 0)
  const istMitSoll = mitSoll.reduce((s, p) => s + p.menge, 0)
  const differenz = istMitSoll - soll
  const offen = positionen.filter((p) => p.pruefStatus === 'offen').length
  const geprueft = positionen.filter((p) => p.pruefStatus === 'geprueft').length
  const unklar = positionen.filter((p) => p.identitaetUnklar).length
  const sicht = positionen.filter((p) => p.ebene && Number(p.ebene) >= SICHTPRUEFUNG_AB_EBENE).length
  const gassen = fortschrittProGasse(positionen)
  const zeiten = positionen.map((p) => p.erfassungSekunden).filter((x): x is number => typeof x === 'number')
  const schnittSekunden = zeiten.length ? Math.round(zeiten.reduce((a, b) => a + b, 0) / zeiten.length) : null
  const auffaellig = positionen.filter((p) => p.pruefStatus !== 'nicht_noetig' || (p.sollMenge !== null && p.sollMenge !== p.menge))
  const nachzaehlungen = positionen
    .flatMap((p) =>
      p.protokoll
        .filter((e) => e.aktion === 'geprueft')
        .map((e) => ({ ...e, palette: p.palettenNummer || 'ohne Nummer', platz: p.lagerplatz || 'ohne Platz' })),
    )
    .sort((a, b) => a.zeit - b.zeit)

  return (
    <div className="bericht flex flex-col gap-6">
      <div className="no-print flex items-center justify-between gap-3">
        <Link to="/" className="text-sm font-semibold text-accent">
          Zurück zur Übersicht
        </Link>
        <div className="flex gap-2">
          <button className="btn btn-secondary" onClick={() => setDiffOffen(true)}>
            Differenzliste
          </button>
          <button
            className="btn btn-secondary"
            disabled={nachzaehlen.length === 0}
            onClick={() => dateiHerunterladen(`${dateinameSicher(aktiveInventur?.name ?? 'inventur')}_nachzaehlliste.csv`, nachzaehlCsv(nachzaehlen, schwelle))}
          >
            CSV Nachzählliste
          </button>
          <button className="btn btn-primary" onClick={() => window.print()}>
            <Printer className="size-4" /> Drucken oder als PDF sichern
          </button>
        </div>
      </div>

      <div>
        <p className="eyebrow">Abschlussbericht</p>
        <h1 className="mt-1 text-[1.625rem] leading-tight font-bold tracking-tight">{aktiveInventur.name}</h1>
        <p className="mt-1 text-sm text-ink-2">
          {[aktiveInventur.lagerort, aktiveInventur.datum && new Date(aktiveInventur.datum).toLocaleDateString('de-DE')].filter(Boolean).join(' · ')}
          {' · Stand '}
          {new Date().toLocaleString('de-DE', { dateStyle: 'short', timeStyle: 'short' })}
        </p>
      </div>

      {!sollDa && <p className="rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">Kein Sollbestand geladen. Differenzen zum Soll sind nicht verfügbar.</p>}
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kennzahl wert={positionen.length} label="Paletten erfasst" ton="accent" />
        <Kennzahl wert={ist.toLocaleString('de-DE')} label="Gebinde gesamt" />
        <Kennzahl
          wert={!sollDa ? 'nicht verfügbar' : differenz === 0 ? '0' : `${differenz > 0 ? '+' : ''}${differenz.toLocaleString('de-DE')}`}
          label="Differenz zum Soll"
          ton={sollDa && differenz !== 0 ? 'bad' : undefined}
        />
        <Kennzahl wert={offen} label="Nachzählung offen" ton={offen ? 'bad' : undefined} />
        <Kennzahl wert={geprueft} label="Nachgezählt" />
        <Kennzahl wert={unklar + sicht} label="Eingeschränkt (Identität, Ebene)" />
        <Kennzahl wert={schnittSekunden === null ? '–' : `${schnittSekunden} s`} label="Ø Zeit je Palette" />
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Fortschritt nach Gasse</h2>
        {gassen.length === 0 ? (
          <p className="card px-4 py-5 text-center text-sm text-ink-2">Noch keine Paletten erfasst.</p>
        ) : (
          <div className="card overflow-x-auto">
            <table className="w-full min-w-[420px] text-sm">
              <thead className="text-left text-xs text-ink-2">
                <tr>
                  <th className="px-3 py-2 font-semibold">Gasse</th>
                  <th className="px-3 py-2 text-right font-semibold">Paletten</th>
                  <th className="px-3 py-2 text-right font-semibold">Menge</th>
                  <th className="px-3 py-2 text-right font-semibold">Offen</th>
                  <th className="px-3 py-2 text-right font-semibold">Abweichung</th>
                  <th className="px-3 py-2 text-right font-semibold">Eingeschr.</th>
                </tr>
              </thead>
              <tbody className="tabular divide-y divide-line">
                {gassen.map((g) => (
                  <tr key={g.gasse}>
                    <td className="px-3 py-2 font-semibold">{g.gasse}</td>
                    <td className="px-3 py-2 text-right">{g.paletten}</td>
                    <td className="px-3 py-2 text-right">{g.menge.toLocaleString('de-DE')}</td>
                    <td className="px-3 py-2 text-right">{g.offen}</td>
                    <td className="px-3 py-2 text-right">{g.abweichung}</td>
                    <td className="px-3 py-2 text-right">{g.eingeschraenkt}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <DifferenzlisteSheet
        offen={diffOffen}
        start={ladeDiffFelder()}
        onClose={() => setDiffOffen(false)}
        onExport={(felder: DiffFeld[]) => {
          dateiHerunterladen(`${dateinameSicher(aktiveInventur?.name ?? 'inventur')}_differenzliste.csv`, differenzlisteCsv(positionen, felder, schwelle))
          setDiffOffen(false)
        }}
      />

      <section>
        <h2 className="mb-2 font-semibold">Nachzählliste ({nachzaehlen.length})</h2>
        {nachzaehlen.length === 0 ? (
          <p className="card px-4 py-5 text-center text-sm text-ink-2">Keine Nachzählung nötig.</p>
        ) : (
          <ol className="card divide-y divide-line">
            {nachzaehlen.map((p, i) => (
              <li key={p.id} className="flex items-baseline gap-3 px-4 py-3">
                <span className="tabular w-6 shrink-0 text-xs text-ink-3">{i + 1}.</span>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">
                    {p.lagerplatz || 'ohne Platz'} · Pal. {p.palettenNummer || 'ohne Nummer'}
                  </p>
                  <p className="text-xs text-ink-2">
                    {p.pruefStatus === 'offen' ? 'Offen' : 'Nachgezählt'}
                    {p.sollMenge !== null ? ` · Soll ${p.sollMenge}, Ist ${p.menge}` : ''}
                  </p>
                </div>
                <Link to={`/position/${p.id}`} className="no-print btn btn-ghost shrink-0 text-sm">
                  Nachzählen
                </Link>
              </li>
            ))}
          </ol>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Auffällige Paletten</h2>
        {auffaellig.length === 0 ? (
          <p className="card px-4 py-5 text-center text-sm text-ink-2">Keine Auffälligkeiten.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {auffaellig.map((p) => {
              const gruende = pruefGruende({ ...p, schwelle })
              return (
                <li key={p.id} className="px-4 py-3">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="min-w-0 truncate font-medium">
                      {p.palettenNummer || 'ohne Nummer'} · {p.lagerplatz || 'ohne Platz'}
                    </p>
                    <span className="shrink-0 text-xs font-semibold text-ink-2">{STATUS_TEXT[p.pruefStatus]}</span>
                  </div>
                  <p className="truncate text-sm text-ink-2">{p.bezeichnung || 'Ohne Artikel'}</p>
                  {gruende.length > 0 && <p className="mt-1 text-sm">{gruende.join('; ')}</p>}
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 font-semibold">Nachzählungen</h2>
        {nachzaehlungen.length === 0 ? (
          <p className="card px-4 py-5 text-center text-sm text-ink-2">Noch keine Nachzählung durchgeführt.</p>
        ) : (
          <ul className="card divide-y divide-line">
            {nachzaehlungen.map((e, i) => (
              <li key={i} className="px-4 py-3 text-sm">
                <p className="font-medium">
                  {e.palette} · {e.platz}
                </p>
                <p className="text-ink-2">
                  {zeit(e.zeit)} · {e.nutzer}
                </p>
                <p className="mt-1">{e.details}</p>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-3 font-semibold">Freigabe</h2>
        <div className="grid gap-6">
          {['Erfasst von', 'Geprüft von', 'Freigegeben von'].map((r) => (
            <div key={r}>
              <div className="h-10 border-b border-ink-3" />
              <p className="mt-1 text-xs text-ink-2">
                {r}, Name, Datum, Unterschrift
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
