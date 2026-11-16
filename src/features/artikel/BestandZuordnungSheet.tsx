import { useState } from 'react'
import { Sheet } from '../../components/ui'
import { BESTAND_FELDER, type BestandZuordnung } from '../../lib/utils/csv'

/** Nutzer ordnet die Spalten der Datei den Feldern der Bestandsliste zu */
export function BestandZuordnungSheet({
  offen,
  kopf,
  vorschau,
  start,
  onBestaetigen,
  onClose,
}: {
  offen: boolean
  kopf: string[]
  vorschau: string[][]
  start: BestandZuordnung
  onBestaetigen: (z: BestandZuordnung, merken: boolean) => void
  onClose: () => void
}) {
  const [z, setZ] = useState<BestandZuordnung>(start)
  const [merken, setMerken] = useState(true)
  const palette = z.palettenNummer

  return (
    <Sheet offen={offen} onClose={onClose} titel="Spalten zuordnen">
      <div className="flex flex-col gap-4">
        <p className="text-sm text-ink-2">Wähle, welche Spalte deiner Datei was bedeutet. Die Palettennummer ist Pflicht.</p>
        {BESTAND_FELDER.map(({ feld, label, pflicht }) => (
          <div key={feld}>
            <label className="label" htmlFor={`zuo-${feld}`}>
              {label}
              {pflicht && <span className="text-bad"> *</span>}
            </label>
            <select
              id={`zuo-${feld}`}
              className="field"
              value={z[feld] === undefined ? '' : String(z[feld])}
              onChange={(e) => {
                const v = e.target.value
                setZ((alt) => {
                  const neu = { ...alt }
                  if (v === '') delete neu[feld]
                  else neu[feld] = Number(v)
                  return neu
                })
              }}
            >
              <option value="">– nicht vorhanden –</option>
              {kopf.map((name, i) => (
                <option key={i} value={i}>
                  {name || `Spalte ${i + 1}`}
                </option>
              ))}
            </select>
          </div>
        ))}

        {vorschau.length > 0 && (
          <div className="card overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-surface-2 text-ink-2">
                <tr>
                  {kopf.map((k, i) => (
                    <th key={i} className="px-2 py-1.5 font-semibold whitespace-nowrap">
                      {k || `Spalte ${i + 1}`}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {vorschau.map((zeile, r) => (
                  <tr key={r} className="border-t border-line">
                    {kopf.map((_, i) => (
                      <td key={i} className="px-2 py-1.5 whitespace-nowrap">
                        {zeile[i] ?? ''}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
          <input type="checkbox" className="size-5" checked={merken} onChange={(e) => setMerken(e.target.checked)} />
          Zuordnung für den nächsten Import merken
        </label>
        <button className="btn btn-primary btn-lg" disabled={palette === undefined} onClick={() => onBestaetigen(z, merken)}>
          Bestand importieren
        </button>
      </div>
    </Sheet>
  )
}
