import { useMemo, useState, type FormEvent } from 'react'
import { AlertTriangle, Barcode, ChevronRight, Info, Package, Search, Sparkles } from 'lucide-react'
import type { Artikel, Konfidenz, PositionEingabe } from '../../types'
import { berechneMenge, kiWeichtAb, parseZahl } from '../../lib/utils/menge'
import { KonfidenzBadge, Sheet, Spinner, ZahlFeld } from '../../components/ui'
import { artikelSuche } from '../artikel/ArtikelPage'

export interface PositionStart {
  artikelId: string | null
  artikelnummer: string
  bezeichnung: string
  gebindeart: string
  lagen: number | null
  stueckProLage: number | null
  fehlend: number | null
  lagerplatz: string
}

export interface KiAnzeige {
  gesamt: number
  konfidenz: Konfidenz
  hinweise: string
  etikett: string | null
  beschreibung: string
  demo: boolean
  barcodeTreffer: string | null
}

const t = (n: number | null) => (n === null ? '' : String(n))

export function PositionForm({
  artikel,
  start,
  ki,
  konfidenzFest,
  fotos = [],
  submitText,
  onSubmit,
  zusatz,
}: {
  artikel: Artikel[]
  start: PositionStart
  ki?: KiAnzeige | null
  /** beim Bearbeiten: vorhandene Konfidenz übernehmen */
  konfidenzFest?: PositionEingabe['konfidenz']
  fotos?: string[]
  submitText: string
  onSubmit: (e: PositionEingabe) => Promise<void> | void
  zusatz?: React.ReactNode
}) {
  const [artikelId, setArtikelId] = useState(start.artikelId)
  const [freiBez, setFreiBez] = useState(start.bezeichnung)
  const [lagen, setLagen] = useState(t(start.lagen))
  const [spl, setSpl] = useState(t(start.stueckProLage))
  const [fehlend, setFehlend] = useState(t(start.fehlend ?? 0))
  const [lagerplatz, setLagerplatz] = useState(start.lagerplatz)
  const [pickerOffen, setPickerOffen] = useState(false)
  const [q, setQ] = useState('')
  const [sendet, setSendet] = useState(false)

  const gewaehlt = artikel.find((a) => a.id === artikelId) ?? null
  const ergebnis = berechneMenge({ lagen: parseZahl(lagen), stueckProLage: parseZahl(spl), fehlend: parseZahl(fehlend) })
  const abweichung = ki ? kiWeichtAb(ki.gesamt, ergebnis.menge) : false
  const treffer = useMemo(() => artikelSuche(artikel, q).slice(0, 60), [artikel, q])

  const waehlen = (a: Artikel | null) => {
    setArtikelId(a?.id ?? null)
    if (a && !spl && a.stueckProLage) setSpl(String(a.stueckProLage))
    setPickerOffen(false)
    setQ('')
  }

  const absenden = async (e: FormEvent) => {
    e.preventDefault()
    if (ergebnis.menge === null || sendet) return
    setSendet(true)
    try {
      await onSubmit({
        artikelId: gewaehlt?.id ?? null,
        artikelnummer: gewaehlt?.artikelnummer ?? '',
        bezeichnung: gewaehlt?.bezeichnung ?? (freiBez.trim() || ki?.beschreibung || ''),
        gebindeart: gewaehlt ? [gewaehlt.gebindeart, gewaehlt.gebindegroesse].filter(Boolean).join(' ') : start.gebindeart,
        lagen: parseZahl(lagen) ?? 0,
        stueckProLage: parseZahl(spl) ?? 0,
        fehlend: parseZahl(fehlend) ?? 0,
        menge: ergebnis.menge,
        lagerplatz: lagerplatz.trim(),
        konfidenz: konfidenzFest ?? ki?.konfidenz ?? 'manuell',
        quelle: ki || (konfidenzFest && konfidenzFest !== 'manuell') ? 'ki' : 'manuell',
        kiGesamt: ki?.gesamt ?? null,
        kiHinweise: ki?.hinweise ?? '',
        etikettText: ki?.etikett ?? null,
      })
    } finally {
      setSendet(false)
    }
  }

  return (
    <form onSubmit={absenden} className="flex flex-col gap-5">
      {fotos.length > 0 && (
        <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1">
          {fotos.map((f, i) => (
            <img key={i} src={f} alt={`Foto ${i + 1}`} className="h-40 w-auto max-w-[75%] shrink-0 snap-start rounded-[14px] object-cover" />
          ))}
        </div>
      )}

      {ki && (
        <div className="card flex flex-col gap-3 px-4 py-4">
          <div className="flex items-center justify-between gap-2">
            <span className="inline-flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="size-4 text-accent" /> {ki.demo ? 'KI Vorschlag (simuliert)' : 'KI Vorschlag'}
            </span>
            <KonfidenzBadge wert={ki.konfidenz} mitLabel />
          </div>
          <p className="text-sm">{ki.beschreibung}</p>
          {ki.etikett && (
            <p className="text-sm text-ink-2">
              <span className="font-semibold text-ink">Etikett:</span> {ki.etikett}
            </p>
          )}
          {ki.barcodeTreffer && (
            <p className="inline-flex items-center gap-2 text-sm text-ok">
              <Barcode className="size-4" /> Barcode erkannt: {ki.barcodeTreffer}
            </p>
          )}
          {ki.hinweise && (
            <p className="flex gap-2 rounded-xl bg-surface-2 px-3 py-2 text-sm text-ink-2">
              <Info className="mt-0.5 size-4 shrink-0" /> {ki.hinweise}
            </p>
          )}
        </div>
      )}

      <div>
        <span className="label">Artikel</span>
        <button type="button" className="card flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => setPickerOffen(true)}>
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent">
            <Package className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            {gewaehlt ? (
              <>
                <p className="truncate font-semibold">{gewaehlt.bezeichnung}</p>
                <p className="truncate text-xs text-ink-2">
                  {gewaehlt.artikelnummer} · {[gewaehlt.gebindeart, gewaehlt.gebindegroesse].filter(Boolean).join(' ')}
                </p>
              </>
            ) : (
              <>
                <p className="font-semibold text-warn">Kein Artikel zugeordnet</p>
                <p className="text-xs text-ink-2">Tippen, um im Artikelstamm zu suchen</p>
              </>
            )}
          </div>
          <ChevronRight className="size-5 text-ink-3" />
        </button>
        {!gewaehlt && (
          <input
            className="field mt-2"
            placeholder="Oder Bezeichnung frei eingeben"
            value={freiBez}
            maxLength={160}
            onChange={(e) => setFreiBez(e.target.value)}
            aria-label="Freie Bezeichnung"
          />
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <ZahlFeld label="Lagen" wert={lagen} onChange={setLagen} />
        <ZahlFeld label="Stück pro Lage" wert={spl} onChange={setSpl} hinweis={gewaehlt?.stueckProLage ? `Stamm: ${gewaehlt.stueckProLage}` : undefined} />
        <ZahlFeld label="Fehlende Stück" wert={fehlend} onChange={setFehlend} hinweis="bei angebrochenen Lagen" ungueltig={!!ergebnis.fehler && ergebnis.brutto !== null} />
        <div className="min-w-0">
          <label className="label" htmlFor="pos-platz">
            Lagerplatz
          </label>
          <input id="pos-platz" className="field min-h-[58px]" placeholder="z. B. A-01-2" value={lagerplatz} maxLength={40} onChange={(e) => setLagerplatz(e.target.value)} />
        </div>
      </div>

      <div className={`rounded-[18px] px-4 py-4 ${ergebnis.menge === null ? 'bg-surface-2' : 'bg-accent-soft'}`} aria-live="polite">
        <p className="eyebrow">Gesamtmenge</p>
        <p className="tabular mt-1 text-sm text-ink-2">
          {lagen || '?'} Lagen × {spl || '?'} Stück − {fehlend || 0} fehlend =
        </p>
        <p className={`tabular text-4xl font-bold ${ergebnis.menge === null ? 'text-ink-3' : 'text-accent'}`}>{ergebnis.menge ?? '?'}</p>
        {ergebnis.fehler && <p className="mt-1 text-sm font-medium text-bad">{ergebnis.fehler}</p>}
      </div>

      {abweichung && (
        <p className="flex gap-2 rounded-[14px] bg-warn-soft px-4 py-3 text-sm text-warn" role="alert">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          Die KI hat {ki?.gesamt} Stück geschätzt, die Rechnung ergibt {ergebnis.menge}. Bitte Lagen und Stück pro Lage prüfen.
        </p>
      )}

      {zusatz}

      <button className="btn btn-primary btn-lg sticky bottom-[calc(84px+env(safe-area-inset-bottom,0px))] shadow-lg" disabled={ergebnis.menge === null || sendet}>
        {sendet && <Spinner />} {submitText}
      </button>

      <Sheet offen={pickerOffen} onClose={() => setPickerOffen(false)} titel="Artikel wählen">
        <label className="relative mb-3 block">
          <span className="sr-only">Suchen</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
          <input className="field pl-12" placeholder="Nummer, Name, Barcode" value={q} onChange={(e) => setQ(e.target.value)} type="search" autoFocus />
        </label>
        <ul className="card divide-y divide-line">
          {treffer.map((a) => (
            <li key={a.id}>
              <button type="button" className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => waehlen(a)} aria-pressed={a.id === artikelId}>
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.bezeichnung}</p>
                  <p className="truncate text-xs text-ink-2">
                    {a.artikelnummer} · {[a.gebindeart, a.gebindegroesse].filter(Boolean).join(' ')}
                  </p>
                </div>
                {a.id === artikelId && <span className="text-xs font-semibold text-accent">gewählt</span>}
              </button>
            </li>
          ))}
          {treffer.length === 0 && <li className="px-4 py-5 text-center text-sm text-ink-2">Kein Treffer</li>}
        </ul>
        {artikelId && (
          <button type="button" className="btn btn-ghost mt-3 w-full" onClick={() => waehlen(null)}>
            Zuordnung entfernen
          </button>
        )}
      </Sheet>
    </form>
  )
}
