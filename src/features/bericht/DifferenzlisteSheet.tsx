import { useState } from 'react'
import { ArrowDown, ArrowUp, Download, FileSpreadsheet } from 'lucide-react'
import { Sheet } from '../../components/ui'
import { beispielDifferenzCsv, DIFF_FELDER, speichereDiffFelder, type DiffFeld } from '../../lib/utils/differenzliste'

/** Auswahl und Reihenfolge der Spalten für den Export in ERP oder PSI, mit Beispieldatei */
export function DifferenzlisteSheet({
  offen,
  start,
  onExport,
  onClose,
}: {
  offen: boolean
  start: DiffFeld[]
  onExport: (felder: DiffFeld[]) => void
  onClose: () => void
}) {
  const [felder, setFelder] = useState<DiffFeld[]>(start)

  const umstellen = (i: number, richtung: -1 | 1) => {
    setFelder((alt) => {
      const j = i + richtung
      if (j < 0 || j >= alt.length) return alt
      const neu = [...alt]
      ;[neu[i], neu[j]] = [neu[j], neu[i]]
      return neu
    })
  }
  const umschalten = (feld: DiffFeld) => setFelder((alt) => (alt.includes(feld) ? alt.filter((f) => f !== feld) : [...alt, feld]))
  const label = (f: DiffFeld) => DIFF_FELDER.find((d) => d.feld === f)?.label ?? f

  return (
    <Sheet offen={offen} onClose={onClose} titel="Differenzliste exportieren">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">
          Wähle die Spalten und ihre Reihenfolge für den Import ins ERP oder PSI. Das Format ist noch nicht final und wird mit der IT abgestimmt.
        </p>

        <fieldset className="flex flex-col gap-2">
          <legend className="label px-0">Spalten</legend>
          {DIFF_FELDER.map((d) => (
            <label key={d.feld} className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" className="size-5" checked={felder.includes(d.feld)} onChange={() => umschalten(d.feld)} />
              {d.label}
            </label>
          ))}
        </fieldset>

        {felder.length > 0 && (
          <div className="flex flex-col gap-2">
            <p className="label">Reihenfolge in der Datei</p>
            <ol className="card divide-y divide-line">
              {felder.map((f, i) => (
                <li key={f} className="flex items-center gap-2 px-3 py-2">
                  <span className="tabular w-6 text-xs text-ink-3">{i + 1}.</span>
                  <span className="min-w-0 flex-1 truncate text-sm">{label(f)}</span>
                  <button className="btn btn-ghost min-h-10 min-w-10 px-2" onClick={() => umstellen(i, -1)} disabled={i === 0} aria-label={`${label(f)} nach oben`}>
                    <ArrowUp className="size-4" />
                  </button>
                  <button
                    className="btn btn-ghost min-h-10 min-w-10 px-2"
                    onClick={() => umstellen(i, 1)}
                    disabled={i === felder.length - 1}
                    aria-label={`${label(f)} nach unten`}
                  >
                    <ArrowDown className="size-4" />
                  </button>
                </li>
              ))}
            </ol>
          </div>
        )}

        <div className="grid grid-cols-1 gap-2">
          <button
            className="btn btn-primary btn-lg"
            disabled={felder.length === 0}
            onClick={() => {
              speichereDiffFelder(felder)
              onExport(felder)
            }}
          >
            <Download className="size-5" /> Differenzliste als CSV
          </button>
          <button
            className="btn btn-secondary"
            disabled={felder.length === 0}
            onClick={async () => {
              const { dateiHerunterladen } = await import('../../lib/utils/csv')
              dateiHerunterladen('Differenzliste_Beispiel.csv', beispielDifferenzCsv(felder))
            }}
          >
            <FileSpreadsheet className="size-5" /> Beispiel mit fiktiven Daten
          </button>
        </div>
      </div>
    </Sheet>
  )
}
