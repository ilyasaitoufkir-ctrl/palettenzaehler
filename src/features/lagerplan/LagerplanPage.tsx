import { useMemo, useState } from 'react'
import { Warehouse } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Leer, Sheet } from '../../components/ui'
import { baueLagerplan, PLATZ_FORMATE, zellenSchluessel, type FeldStatus, type LagerplanZelle, type PlatzFormat } from '../../lib/utils/lagerplan'
import { anzahlText } from '../../lib/utils/soll'

const FORMAT_KEY = 'pz-platz-format'

function ladeFormat(): PlatzFormat {
  try {
    const v = localStorage.getItem(FORMAT_KEY)
    return v === 'gasse-ebene-platz' ? 'gasse-ebene-platz' : 'gasse-platz-ebene'
  } catch {
    return 'gasse-platz-ebene'
  }
}

const KACHEL: Record<FeldStatus, string> = {
  offen: 'bg-surface-2 text-ink-3 ring-1 ring-line',
  ok: 'bg-ok-soft text-ok',
  abweichung: 'bg-bad-soft text-bad',
  nachzaehlen: 'bg-warn-soft text-warn ring-1 ring-warn',
}

const LEGENDE: { status: FeldStatus; text: string }[] = [
  { status: 'offen', text: 'Offen' },
  { status: 'ok', text: 'Gezählt, ohne Abweichung' },
  { status: 'abweichung', text: 'Abweichung' },
  { status: 'nachzaehlen', text: 'Nachzählung nötig' },
]

const STATUS_TEXT: Record<FeldStatus, string> = {
  offen: 'Noch nicht gezählt',
  ok: 'Gezählt, ohne Abweichung',
  abweichung: 'Menge weicht vom Soll ab',
  nachzaehlen: 'Nachzählung nötig',
}

/** Live Lagerplan: Gassen als Spalten, Regalebenen als Zeilen, je Stellplatz eine Kachel */
export function LagerplanPage() {
  const { aktiveInventur, bestand, positionen } = useApp()
  const [format, setFormat] = useState<PlatzFormat>(ladeFormat)
  const [offen, setOffen] = useState<LagerplanZelle | null>(null)

  const plan = useMemo(() => baueLagerplan(bestand, positionen, format), [bestand, positionen, format])

  const waehleFormat = (f: PlatzFormat) => {
    setFormat(f)
    try {
      localStorage.setItem(FORMAT_KEY, f)
    } catch {
      // ohne Speicher gilt die Auswahl nur für diese Sitzung
    }
  }

  if (!aktiveInventur) {
    return <Leer icon={<Warehouse className="size-7" />} titel="Keine aktive Inventur" text="Aktiviere eine Inventur, dann siehst du hier den Lagerplan." />
  }
  if (plan.zellen.size === 0) {
    return (
      <Leer
        icon={<Warehouse className="size-7" />}
        titel="Noch keine Stellplätze"
        text="Der Lagerplan entsteht aus den Stellplätzen der Bestandsliste und den erfassten Paletten. Prüfe das Stellplatz-Format, wenn nichts erscheint."
      />
    )
  }

  const platzNummern = (gasse: string) =>
    [...new Set([...plan.zellen.values()].filter((z) => z.stellplatz.gasse === gasse).map((z) => z.stellplatz.platz))].sort((a, b) => a - b)

  return (
    <>
      <h1 className="mb-1 text-[1.625rem] leading-tight font-bold tracking-tight">Lagerplan</h1>
      <p className="mb-4 text-sm text-ink-2">Live. Tippe auf einen Stellplatz für Details.</p>

      <div className="card mb-4 flex flex-col gap-3 px-4 py-4">
        <p className="eyebrow">Stellplatz Format</p>
        <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Format der Stellplatz ID">
          {PLATZ_FORMATE.map((f) => (
            <button
              key={f.wert}
              role="radio"
              aria-checked={format === f.wert}
              className={`min-h-11 rounded-xl px-3 text-left text-sm ${format === f.wert ? 'bg-accent-soft font-semibold text-accent' : 'bg-surface-2 text-ink-2'}`}
              onClick={() => waehleFormat(f.wert)}
            >
              {f.label}
              <span className="block text-xs opacity-80">z. B. {f.beispiel}</span>
            </button>
          ))}
        </div>
        {plan.unlesbar > 0 && (
          <p className="text-xs text-warn">{anzahlText(plan.unlesbar, 'Stellplatz ist', 'Stellplätze sind')} nicht lesbar und fehlen im Plan.</p>
        )}
      </div>

      <ul className="mb-4 flex flex-wrap gap-x-4 gap-y-2 text-xs text-ink-2">
        {LEGENDE.map((l) => (
          <li key={l.status} className="flex items-center gap-2">
            <span className={`inline-block size-3 rounded ${KACHEL[l.status]}`} aria-hidden />
            {l.text}
          </li>
        ))}
      </ul>

      <div className="card overflow-x-auto p-3">
        <div className="flex min-w-max flex-col gap-3">
          {plan.ebenen.map((ebene) => (
            <div key={ebene} className="flex items-start gap-3">
              <span className="tabular w-14 shrink-0 pt-2 text-right text-xs font-semibold text-ink-3">Ebene {ebene}</span>
              <div className="flex gap-4">
                {plan.gassen.map((gasse) => (
                  <div key={gasse} className="flex min-w-[6.5rem] flex-col gap-1.5">
                    {ebene === plan.ebenen[0] && <p className="text-center text-xs font-bold text-ink-2">Gasse {gasse}</p>}
                    <div className="flex flex-wrap gap-1.5">
                      {platzNummern(gasse).map((platz) => {
                        const z = plan.zellen.get(zellenSchluessel(gasse, ebene, platz))
                        if (!z) return <span key={platz} className="size-11 rounded-xl border border-dashed border-line" aria-hidden />
                        return (
                          <button
                            key={platz}
                            className={`tabular grid size-11 place-items-center rounded-xl text-xs font-bold ${KACHEL[z.status]}`}
                            onClick={() => setOffen(z)}
                            aria-label={`Stellplatz ${z.stellplatz.id}, ${STATUS_TEXT[z.status]}`}
                          >
                            {String(platz).padStart(2, '0')}
                          </button>
                        )
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      <Sheet offen={!!offen} onClose={() => setOffen(null)} titel={offen ? `Stellplatz ${offen.stellplatz.id}` : 'Stellplatz'}>
        {offen && (
          <div className="flex flex-col gap-3">
            <p className="font-semibold">{STATUS_TEXT[offen.status]}</p>
            <p className="text-sm text-ink-2">
              {anzahlText(offen.sollAnzahl, 'Palette laut Bestand', 'Paletten laut Bestand')} · {anzahlText(offen.positionen.length, 'erfasste Palette', 'erfasste Paletten')}
            </p>
            <ul className="flex flex-col gap-2">
              {offen.positionen.map((p) => (
                <li key={p.id} className="card flex items-center justify-between gap-3 px-4 py-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.bezeichnung || 'Ohne Artikel'}</p>
                    <p className="truncate text-xs text-ink-2">Pal. {p.palettenNummer || 'ohne Nummer'}</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="tabular text-lg font-bold">{p.menge}</p>
                    {p.sollMenge !== null && <p className="tabular text-xs text-ink-2">Soll {p.sollMenge}</p>}
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Sheet>
    </>
  )
}
