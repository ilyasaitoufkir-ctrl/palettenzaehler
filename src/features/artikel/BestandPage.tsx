import { useMemo, useRef, useState } from 'react'
import { Boxes, FileSpreadsheet, Search, Upload } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Leer, Seitenkopf, Sheet, Spinner } from '../../components/ui'
import { bestandAusZeilen, parseCsv } from '../../lib/utils/csv'
import { dateiAusgeben } from '../../lib/utils/download'
import { nummerNorm } from '../../lib/utils/gs1'
import { zeitRelativ } from '../../lib/utils/format'
import { StammdatenTabs } from './StammdatenTabs'

/**
 * Bestandsliste: Palettennummern mit Artikel, Menge, Charge und Lagerplatz aus dem ERP.
 * Wird ein Barcode gescannt oder auf dem Foto gelesen, schlägt die App hier nach.
 */
export function BestandPage() {
  const { bestand, bestandMeta, artikel, repo, toast } = useApp()
  const [q, setQ] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [info, setInfo] = useState<{ anzahl: number; fehler: string[]; ohneArtikel: number } | null>(null)
  const dateiRef = useRef<HTMLInputElement>(null)

  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase()
    const n = nummerNorm(q)
    const l = !s
      ? bestand
      : bestand.filter(
          (p) =>
            (n && p.id.includes(n)) ||
            [p.artikelnummer, p.bezeichnung, p.charge, p.lagerplatz].some((f) => f.toLowerCase().includes(s)),
        )
    return [...l].sort((a, b) => a.lagerplatz.localeCompare(b.lagerplatz, 'de', { numeric: true })).slice(0, 300)
  }, [bestand, q])

  const importieren = async (datei: File | undefined) => {
    if (!datei) return
    setLaeuft(true)
    try {
      const istExcel = /\.xlsx$/i.test(datei.name) || datei.type.includes('spreadsheetml')
      const zeilen = istExcel ? await (await import('../export/excel')).excelZeilen(datei) : parseCsv(await datei.text())
      const { paletten, fehler } = bestandAusZeilen(zeilen)
      if (!paletten.length) {
        setInfo({ anzahl: 0, fehler, ohneArtikel: 0 })
        return
      }
      await repo.bestandErsetzen(paletten, datei.name)
      const nummern = new Set(artikel.map((a) => nummerNorm(a.artikelnummer)))
      const ohneArtikel = paletten.filter((p) => p.artikelnummer && !nummern.has(nummerNorm(p.artikelnummer))).length
      setInfo({ anzahl: paletten.length, fehler, ohneArtikel })
    } catch {
      toast('Die Datei konnte nicht gelesen werden.', 'fehler')
    } finally {
      setLaeuft(false)
      if (dateiRef.current) dateiRef.current.value = ''
    }
  }

  const summe = bestand.reduce((s, p) => s + (p.menge ?? 0), 0)

  return (
    <>
      <Seitenkopf
        titel="Stammdaten"
        unter={bestandMeta ? `Bestand: ${bestandMeta.anzahl} Paletten, Stand ${zeitRelativ(bestandMeta.importiertAm)}` : 'Noch keine Bestandsliste'}
      />
      <StammdatenTabs />

      <div className="card mb-4 flex flex-col gap-3 px-4 py-4">
        <p className="text-sm text-ink-2">
          Lade hier den Bestand aus eurem System als Excel oder CSV, zum Beispiel direkt aus OneDrive oder SharePoint. Benötigt wird die Spalte{' '}
          <strong className="text-ink">Palettennummer</strong> (oder NVE, SSCC), dazu am besten Bezeichnung, Menge, Charge und Lagerplatz. Ein neuer
          Import ersetzt die alte Liste.
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button className="btn btn-primary" onClick={() => dateiRef.current?.click()} disabled={laeuft}>
            {laeuft ? <Spinner /> : <Upload className="size-5" />} Bestand laden
          </button>
          <button
            className="btn btn-secondary"
            onClick={async () => {
              const { bestandVorlage } = await import('../export/excel')
              await dateiAusgeben('Bestand_Vorlage.xlsx', await bestandVorlage())
            }}
          >
            <FileSpreadsheet className="size-5" /> Vorlage
          </button>
        </div>
        <input
          ref={dateiRef}
          type="file"
          accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
          className="hidden"
          onChange={(e) => importieren(e.target.files?.[0])}
        />
      </div>

      {bestand.length === 0 ? (
        <Leer
          icon={<Boxes className="size-7" />}
          titel="Noch kein Bestand hinterlegt"
          text="Ohne Bestandsliste erkennt die App Artikel über ihren Barcode im Artikelstamm. Mit Bestandsliste weiß sie zu jeder Palettennummer auch Menge, Charge und Lagerplatz."
        />
      ) : (
        <>
          <label className="relative mb-3 block">
            <span className="sr-only">Bestand durchsuchen</span>
            <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
            <input className="field pl-12" type="search" placeholder="Palettennummer, Artikel, Charge, Platz" value={q} onChange={(e) => setQ(e.target.value)} />
          </label>
          <p className="mb-2 text-xs font-medium text-ink-3">
            {bestand.length} Paletten · {summe.toLocaleString('de-DE')} Stück laut Bestand
            {gefiltert.length >= 300 ? ' · die ersten 300 Treffer' : ''}
          </p>
          <ul className="card divide-y divide-line">
            {gefiltert.map((p) => (
              <li key={p.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="tabular truncate font-semibold">{p.palettenNummer}</p>
                  <p className="truncate text-xs text-ink-2">
                    {p.bezeichnung || 'ohne Artikel'}
                  </p>
                  <p className="truncate text-xs text-ink-3">
                    {[p.lagerplatz && `Platz ${p.lagerplatz}`, p.charge && `Ch. ${p.charge}`].filter(Boolean).join(' · ')}
                  </p>
                </div>
                {p.menge !== null && <span className="tabular shrink-0 text-lg font-bold">{p.menge}</span>}
              </li>
            ))}
          </ul>
        </>
      )}

      <Sheet offen={!!info} onClose={() => setInfo(null)} titel="Bestand geladen">
        {info && (
          <div className="flex flex-col gap-3">
            <p>
              <strong>{info.anzahl}</strong> Paletten übernommen.
            </p>
            {info.ohneArtikel > 0 && (
              <p className="rounded-[14px] bg-info-soft px-4 py-3 text-sm text-info">
                {info.ohneArtikel} Paletten gehören zu einem Artikel, der nicht im Artikelstamm steht. Sie werden trotzdem erkannt, nur ohne Stück pro Lage aus dem Stamm.
              </p>
            )}
            {info.fehler.length > 0 && (
              <div className="rounded-[14px] bg-warn-soft px-4 py-3 text-sm text-warn">
                <p className="font-semibold">{info.fehler.length} Hinweise</p>
                <ul className="mt-1 list-disc pl-4">
                  {info.fehler.slice(0, 12).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn btn-primary" onClick={() => setInfo(null)}>
              Fertig
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}
