import { Link } from 'react-router-dom'
import { CheckCircle2, Circle, Map, Warehouse } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Leer } from '../../components/ui'
import { gassenListe } from '../../lib/utils/gasse'

/** Gassen-Liste: alle Plätze je Gasse in fester Reihenfolge, mit erledigt oder offen */
export function GassenPage() {
  const { aktiveInventur, bestand, positionen } = useApp()

  if (!aktiveInventur) {
    return <Leer icon={<Warehouse className="size-7" />} titel="Keine aktive Inventur" text="Lege eine Inventur an und aktiviere sie, dann siehst du hier die Gassen." />
  }

  const { gassen, nichtImBestand } = gassenListe(bestand, positionen)
  const erledigt = gassen.reduce((s, g) => s + g.erledigt, 0)
  const gesamt = gassen.reduce((s, g) => s + g.gesamt, 0)

  return (
    <>
      <h1 className="mb-1 text-[1.625rem] leading-tight font-bold tracking-tight">Gassen</h1>
      <div className="mb-5 flex items-center justify-between gap-3">
        <p className="text-sm text-ink-2">
          {erledigt} von {gesamt} Plätzen erledigt
        </p>
        <Link to="/lagerplan" className="btn btn-secondary">
          <Map className="size-5" /> Lagerplan
        </Link>
      </div>

      {bestand.length === 0 && (
        <p className="mb-5 rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Keine Bestandsliste importiert. Es werden nur die bereits erfassten Paletten angezeigt. Mit einer Bestandsliste siehst du auch die offenen Plätze.
        </p>
      )}

      {gassen.length === 0 ? (
        <Leer icon={<Warehouse className="size-7" />} titel="Noch keine Plätze" text="Sobald Paletten erfasst oder importiert sind, erscheinen die Gassen hier." />
      ) : (
        <div className="flex flex-col gap-4">
          {gassen.map((g) => {
            const anteil = g.gesamt ? Math.round((g.erledigt / g.gesamt) * 100) : 0
            return (
              <section key={g.gasse} className="card overflow-hidden">
                <div className="flex items-center justify-between gap-3 px-4 py-3">
                  <div className="flex items-center gap-3">
                    <div className="grid size-10 place-items-center rounded-xl bg-accent-soft text-accent font-bold">{g.gasse}</div>
                    <p className="font-semibold">Gasse {g.gasse}</p>
                  </div>
                  <p className="tabular text-sm text-ink-2">
                    {g.erledigt} / {g.gesamt} · {anteil} %
                  </p>
                </div>
                <div className="h-1 bg-surface-2" aria-hidden>
                  <div className="h-full bg-accent" style={{ width: `${anteil}%` }} />
                </div>
                <ul className="divide-y divide-line">
                  {g.plaetze.map((p, i) => (
                    <li key={`${p.lagerplatz}-${p.palettenNummer}-${i}`} className="flex items-center gap-3 px-4 py-3">
                      {p.erledigt ? <CheckCircle2 className="size-5 shrink-0 text-ok" /> : <Circle className="size-5 shrink-0 text-ink-3" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">{p.lagerplatz || 'ohne Platz'}</p>
                        <p className="truncate text-xs text-ink-2">
                          {p.bezeichnung || 'Ohne Artikel'}
                          {p.palettenNummer ? ` · Pal. ${p.palettenNummer}` : ''}
                        </p>
                      </div>
                      <span className={`shrink-0 rounded-full px-2.5 py-1 text-xs font-semibold ${p.erledigt ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'}`}>
                        {p.erledigt ? 'Erledigt' : 'Offen'}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      {nichtImBestand > 0 && <p className="mt-4 text-sm text-ink-2">{nichtImBestand} erfasste Paletten stehen nicht in der Bestandsliste.</p>}
    </>
  )
}
