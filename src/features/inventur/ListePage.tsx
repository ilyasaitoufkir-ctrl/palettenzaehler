import { useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { ArrowDownUp, ClipboardList, Download, FileSpreadsheet, FileText, Image as ImageIcon, Search } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { KonfidenzBadge, Leer, Seitenkopf, Sheet, Spinner } from '../../components/ui'
import { inventurCsv, sollIstAbgleich, sollIstCsv } from '../../lib/utils/csv'
import { dateiAusgeben } from '../../lib/utils/download'
import { dateinameSicher, zeitRelativ } from '../../lib/utils/format'
import type { Position } from '../../types'

type Filter = 'alle' | 'niedrig' | 'ohne' | 'manuell' | 'pruefen'
type Sortierung = 'neu' | 'alt' | 'menge' | 'platz' | 'artikel'

const SORT: Record<Sortierung, { text: string; fn: (a: Position, b: Position) => number }> = {
  neu: { text: 'Neueste zuerst', fn: (a, b) => b.erstelltAm - a.erstelltAm },
  alt: { text: 'Älteste zuerst', fn: (a, b) => a.erstelltAm - b.erstelltAm },
  menge: { text: 'Größte Menge', fn: (a, b) => b.menge - a.menge },
  platz: { text: 'Lagerplatz', fn: (a, b) => a.lagerplatz.localeCompare(b.lagerplatz, 'de', { numeric: true }) },
  artikel: { text: 'Bezeichnung', fn: (a, b) => a.bezeichnung.localeCompare(b.bezeichnung, 'de', { numeric: true }) },
}

export function ListePage() {
  const { aktiveInventur, positionen, positionenGeladen, artikel, toast } = useApp()
  const [params, setParams] = useSearchParams()
  const ansicht = params.get('ansicht') === 'abgleich' ? 'abgleich' : 'positionen'
  const [q, setQ] = useState('')
  const [filter, setFilter] = useState<Filter>('alle')
  const [sortierung, setSortierung] = useState<Sortierung>('neu')
  const [csvVorschau, setCsvVorschau] = useState<{ name: string; text: string } | null>(null)
  const [exportOffen, setExportOffen] = useState(false)
  const [exportLaeuft, setExportLaeuft] = useState(false)

  const gefiltert = useMemo(() => {
    const s = q.trim().toLowerCase()
    return positionen
      .filter((p) => {
        if (filter === 'niedrig' && p.konfidenz !== 'niedrig') return false
        if (filter === 'ohne' && p.artikelId) return false
        if (filter === 'manuell' && p.konfidenz !== 'manuell') return false
        if (filter === 'pruefen' && p.pruefStatus !== 'offen') return false
        if (!s) return true
        return [p.artikelnummer, p.bezeichnung, p.lagerplatz, p.gebindeart, p.erstelltVon, p.palettenNummer, p.charge].some((f) => f.toLowerCase().includes(s))
      })
      .sort(SORT[sortierung].fn)
  }, [positionen, q, filter, sortierung])

  const abgleich = useMemo(() => sollIstAbgleich(positionen, artikel), [positionen, artikel])
  const niedrig = positionen.filter((p) => p.konfidenz === 'niedrig').length
  const offenePruefung = positionen.filter((p) => p.pruefStatus === 'offen').length
  const ohne = positionen.filter((p) => !p.artikelId).length

  if (!aktiveInventur) {
    return (
      <Leer
        icon={<ClipboardList className="size-7" />}
        titel="Keine aktive Inventur"
        text="Wähle eine Inventur, um ihre Positionen zu sehen."
        aktion={
          <Link to="/inventuren" className="btn btn-primary">
            Zu den Inventuren
          </Link>
        }
      />
    )
  }

  const ausgeben = async (name: string, blob: Blob, csvText?: string) => {
    const r = await dateiAusgeben(name, blob)
    if (r === 'gespeichert' || r === 'geteilt') toast(r === 'geteilt' ? 'Datei bereit zum Speichern oder Teilen' : 'Datei gespeichert')
    else if (r === 'nicht_moeglich') {
      if (csvText) setCsvVorschau({ name, text: csvText })
      else toast('Speichern ist hier nicht möglich.', 'fehler')
    }
  }
  const basisName = `${dateinameSicher(aktiveInventur.name)}_${aktiveInventur.datum}`
  const csvAusgeben = (name: string, text: string) => ausgeben(name, new Blob([text], { type: 'text/csv;charset=utf-8' }), text)

  const excelAusgeben = async (mitFotos: boolean) => {
    if (!positionen.length && !artikel.length) return toast('Noch nichts zum Exportieren.', 'fehler')
    setExportLaeuft(true)
    try {
      const { inventurExcel } = await import('../export/excel')
      const blob = await inventurExcel(aktiveInventur, positionen, artikel, { mitFotos })
      setExportOffen(false)
      await ausgeben(`${basisName}.xlsx`, blob)
    } catch {
      toast('Die Excel Datei konnte nicht erstellt werden.', 'fehler')
    } finally {
      setExportLaeuft(false)
    }
  }

  const summe = gefiltert.reduce((s, p) => s + p.menge, 0)

  return (
    <>
      <Seitenkopf
        titel="Inventurliste"
        unter={aktiveInventur.name}
        aktion={
          <button className="btn btn-primary" onClick={() => setExportOffen(true)}>
            <Download className="size-5" /> Export
          </button>
        }
      />

      <div className="mb-4 grid grid-cols-2 rounded-[14px] bg-surface-2 p-1" role="tablist">
        {(['positionen', 'abgleich'] as const).map((a) => (
          <button
            key={a}
            role="tab"
            aria-selected={ansicht === a}
            className={`min-h-11 rounded-[11px] text-sm font-semibold ${ansicht === a ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`}
            onClick={() => setParams(a === 'abgleich' ? { ansicht: 'abgleich' } : {}, { replace: true })}
          >
            {a === 'positionen' ? `Positionen (${positionen.length})` : 'Soll/Ist'}
          </button>
        ))}
      </div>

      {ansicht === 'abgleich' ? (
        abgleich.length === 0 ? (
          <Leer icon={<ClipboardList className="size-7" />} titel="Noch nichts abzugleichen" text="Hinterlege Sollbestände im Artikelstamm oder erfasse Paletten." />
        ) : (
          <>
            <p className="mb-3 text-sm text-ink-2">Summe je Artikel aus allen Positionen, verglichen mit dem Sollbestand im Artikelstamm.</p>
            <ul className="flex flex-col gap-2">
              {abgleich.map((z) => {
                const ton = z.differenz === null ? 'text-ink-3' : z.differenz === 0 ? 'text-ok' : 'text-bad'
                return (
                  <li key={z.artikelnummer + z.bezeichnung} className="card px-4 py-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-semibold">{z.bezeichnung}</p>
                        <p className="truncate text-xs text-ink-2">
                          {z.gebindeart || 'ohne Gebinde'} · {z.positionen} {z.positionen === 1 ? 'Palette' : 'Paletten'}
                        </p>
                      </div>
                      <div className={`tabular shrink-0 text-right text-lg font-bold ${ton}`}>
                        {z.differenz === null ? 'kein Soll' : `${z.differenz > 0 ? '+' : ''}${z.differenz}`}
                      </div>
                    </div>
                    <div className="tabular mt-2 grid grid-cols-2 gap-2 text-sm">
                      <span className="rounded-lg bg-surface-2 px-3 py-1.5">
                        Soll <strong>{z.soll ?? '?'}</strong>
                      </span>
                      <span className="rounded-lg bg-surface-2 px-3 py-1.5">
                        Ist <strong>{z.ist}</strong>
                      </span>
                    </div>
                    {z.niedrigeKonfidenz > 0 && (
                      <p className="mt-2 text-xs font-medium text-bad">
                        {z.niedrigeKonfidenz} {z.niedrigeKonfidenz === 1 ? 'Palette' : 'Paletten'} mit niedriger Konfidenz, Ist Wert nachzählen
                      </p>
                    )}
                  </li>
                )
              })}
            </ul>
          </>
        )
      ) : (
        <>
          <div className="mb-3 flex gap-2">
            <label className="relative min-w-0 flex-1">
              <span className="sr-only">Positionen suchen</span>
              <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
              <input className="field pl-12" type="search" placeholder="Artikel, Palette, Charge, Platz" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <label className="relative">
              <span className="sr-only">Sortierung</span>
              <ArrowDownUp className="pointer-events-none absolute top-1/2 left-3.5 size-5 -translate-y-1/2 text-ink-2" />
              <select
                className="field w-[52px] appearance-none pl-12 text-transparent sm:w-auto sm:pr-4 sm:text-ink"
                value={sortierung}
                onChange={(e) => setSortierung(e.target.value as Sortierung)}
              >
                {Object.entries(SORT).map(([k, v]) => (
                  <option key={k} value={k} className="text-ink">
                    {v.text}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className="-mx-4 mb-4 flex gap-2 overflow-x-auto px-4 pb-1">
            {(
              [
                ['alle', `Alle`],
                ['niedrig', `Niedrige Konfidenz (${niedrig})`],
                ['pruefen', `Nachzählung offen (${offenePruefung})`],
                ['ohne', `Ohne Artikel (${ohne})`],
                ['manuell', 'Manuell'],
              ] as const
            ).map(([k, t]) => (
              <button key={k} className="chip shrink-0" aria-pressed={filter === k} onClick={() => setFilter(k)}>
                {t}
              </button>
            ))}
          </div>

          {!positionenGeladen ? (
            <p className="py-8 text-center text-sm text-ink-2">Lädt …</p>
          ) : positionen.length === 0 ? (
            <Leer
              icon={<ClipboardList className="size-7" />}
              titel="Noch keine Positionen"
              text="Erfasse die erste Palette per Foto oder manuell."
              aktion={
                <Link to="/erfassen" className="btn btn-primary">
                  Palette erfassen
                </Link>
              }
            />
          ) : gefiltert.length === 0 ? (
            <p className="card px-4 py-6 text-center text-sm text-ink-2">Keine Position passt zu Suche oder Filter.</p>
          ) : (
            <>
              <p className="mb-2 text-xs font-medium text-ink-3">
                {gefiltert.length} Positionen · {summe.toLocaleString('de-DE')} Gebinde
              </p>
              <ul className="flex flex-col gap-2">
                {gefiltert.map((p) => (
                  <li key={p.id}>
                    <Link
                      to={`/position/${p.id}`}
                      className={`card flex items-center gap-3 px-4 py-3 ${p.konfidenz === 'niedrig' ? 'border-l-4 border-l-bad' : ''}`}
                    >
                      {p.fotoUrls[0] && <img src={p.fotoUrls[0]} alt="" className="size-12 shrink-0 rounded-xl object-cover" />}
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold">{p.bezeichnung || 'Ohne Artikel'}</p>
                        <p className="truncate text-xs text-ink-2">
                          {p.gebindeart || 'Gebinde ?'}
                          {p.palettenNummer ? ` · Pal. ${p.palettenNummer}` : ''}
                          {p.charge ? ` · Ch. ${p.charge}` : ''}
                        </p>
                        <p className="truncate text-xs text-ink-3">
                          {p.lagerplatz || 'ohne Platz'} · {zeitRelativ(p.erstelltAm)} · {p.erstelltVon}
                        </p>
                      </div>
                      <div className="flex shrink-0 flex-col items-end gap-1">
                        <span className="tabular text-xl font-bold">{p.menge}</span>
                        {p.sollMenge !== null && p.sollMenge !== p.menge && (
                          <span className="tabular text-xs font-semibold text-bad">
                            Soll {p.sollMenge} ({p.menge - p.sollMenge > 0 ? '+' : ''}
                            {p.menge - p.sollMenge})
                          </span>
                        )}
                        <KonfidenzBadge wert={p.konfidenz} />
                        {p.pruefStatus === 'offen' && (
                          <span className="rounded-full bg-warn-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-warn">Nachzählen</span>
                        )}
                        {p.pruefStatus === 'geprueft' && (
                          <span className="rounded-full bg-ok-soft px-2 py-0.5 text-[0.6875rem] font-semibold text-ok">Geprüft</span>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
      <Sheet offen={exportOffen} onClose={() => !exportLaeuft && setExportOffen(false)} titel="Inventur exportieren">
        <div className="flex flex-col gap-3">
          <button className="card flex items-center gap-3 px-4 py-4 text-left" disabled={exportLaeuft} onClick={() => excelAusgeben(true)}>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-brand text-accent-ink">
              {exportLaeuft ? <Spinner /> : <ImageIcon className="size-5" />}
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Excel mit Fotos</p>
              <p className="text-sm text-ink-2">Alle Paletten mit Foto, Soll/Ist Blatt und Summen</p>
            </div>
          </button>
          <button className="card flex items-center gap-3 px-4 py-4 text-left" disabled={exportLaeuft} onClick={() => excelAusgeben(false)}>
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
              <FileSpreadsheet className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">Excel ohne Fotos</p>
              <p className="text-sm text-ink-2">Kleinere Datei, gleiche Tabellen</p>
            </div>
          </button>
          <button
            className="card flex items-center gap-3 px-4 py-4 text-left"
            disabled={exportLaeuft}
            onClick={() => {
              if (ansicht === 'abgleich') csvAusgeben(`${basisName}_soll-ist.csv`, sollIstCsv(abgleich))
              else if (positionen.length) csvAusgeben(`${basisName}.csv`, inventurCsv(positionen, artikel))
              else toast('Noch keine Positionen zum Exportieren.', 'fehler')
              setExportOffen(false)
            }}
          >
            <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-2">
              <FileText className="size-5" />
            </div>
            <div className="min-w-0">
              <p className="font-semibold">CSV</p>
              <p className="text-sm text-ink-2">{ansicht === 'abgleich' ? 'Soll/Ist als einfache Textdatei' : 'Positionen als einfache Textdatei'}</p>
            </div>
          </button>
        </div>
      </Sheet>

      <Sheet offen={!!csvVorschau} onClose={() => setCsvVorschau(null)} titel="CSV Export">
        {csvVorschau && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-ink-2">Speichern ist hier nicht möglich. Kopiere den Inhalt und füge ihn in Excel ein oder speichere ihn als {csvVorschau.name}.</p>
            <textarea id="csv-text" readOnly className="field tabular h-56 font-mono text-xs" value={csvVorschau.text.replace(/^\uFEFF/, '')} />
            <button
              className="btn btn-primary"
              onClick={() => {
                navigator.clipboard
                  .writeText(csvVorschau.text.replace(/^\uFEFF/, ''))
                  .then(() => toast('CSV kopiert'))
                  .catch(() => {
                    const t = document.getElementById('csv-text') as HTMLTextAreaElement | null
                    t?.select()
                    toast('Text markiert, bitte kopieren', 'info')
                  })
              }}
            >
              Kopieren
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}
