import { useMemo, useRef, useState, type FormEvent } from 'react'
import { ImagePlus, Package, Plus, Search, Trash2, Upload } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, Leer, Seitenkopf, Sheet, Spinner } from '../../components/ui'
import type { Artikel, ArtikelEingabe } from '../../types'
import { artikelAusCsv, artikelAusZeilen } from '../../lib/utils/csv'
import { dateiAusgeben } from '../../lib/utils/download'
import { bildOptimieren } from '../../lib/utils/bild'

const GEBINDE = ['Kanister', 'Karton', 'Fass', 'IBC', 'Eimer', 'Sack', 'Sonstiges']

const leer = (): ArtikelEingabe => ({
  artikelnummer: '',
  bezeichnung: '',
  gebindeart: 'Kanister',
  gebindegroesse: '',
  stueckProLage: null,
  lagenProPalette: null,
  barcode: null,
  sollbestand: null,
})

export function artikelSuche(liste: Artikel[], q: string): Artikel[] {
  const s = q.trim().toLowerCase()
  if (!s) return liste
  return liste.filter((a) =>
    [a.artikelnummer, a.bezeichnung, a.gebindeart, a.gebindegroesse, a.barcode ?? ''].some((f) => f.toLowerCase().includes(s)),
  )
}

const zahlOderNull = (s: string): number | null => {
  if (!s.trim()) return null
  const n = Number(s)
  return Number.isInteger(n) && n >= 0 ? n : Number.NaN
}

export function ArtikelPage() {
  const { artikel, repo, toast } = useApp()
  const [q, setQ] = useState('')
  const [form, setForm] = useState<{ id: string | null; d: ArtikelEingabe; foto: string | null } | null>(null)
  const [zahlen, setZahlen] = useState({ spl: '', lpp: '', soll: '' })
  const [loeschen, setLoeschen] = useState<Artikel | null>(null)
  const [importInfo, setImportInfo] = useState<{ neu: number; aktualisiert: number; fehler: string[] } | null>(null)
  const [laeuft, setLaeuft] = useState(false)
  const csvRef = useRef<HTMLInputElement>(null)
  const fotoRef = useRef<HTMLInputElement>(null)

  const gefiltert = useMemo(() => artikelSuche(artikel, q), [artikel, q])

  const oeffnen = (a: Artikel | null) => {
    const d = a
      ? {
          artikelnummer: a.artikelnummer,
          bezeichnung: a.bezeichnung,
          gebindeart: a.gebindeart,
          gebindegroesse: a.gebindegroesse,
          stueckProLage: a.stueckProLage,
          lagenProPalette: a.lagenProPalette,
          barcode: a.barcode,
          sollbestand: a.sollbestand,
        }
      : leer()
    setForm({ id: a?.id ?? null, d, foto: a?.referenzfotoUrl ?? null })
    setZahlen({ spl: d.stueckProLage?.toString() ?? '', lpp: d.lagenProPalette?.toString() ?? '', soll: d.sollbestand?.toString() ?? '' })
  }

  const speichern = async (e: FormEvent) => {
    e.preventDefault()
    if (!form) return
    const nr = form.d.artikelnummer.trim()
    const bez = form.d.bezeichnung.trim()
    if (!nr || !bez) return toast('Artikelnummer und Bezeichnung sind Pflicht.', 'fehler')
    if (artikel.some((a) => a.artikelnummer === nr && a.id !== form.id)) return toast(`Artikelnummer ${nr} gibt es schon.`, 'fehler')
    const spl = zahlOderNull(zahlen.spl)
    const lpp = zahlOderNull(zahlen.lpp)
    const soll = zahlOderNull(zahlen.soll)
    if ([spl, lpp, soll].some((v) => Number.isNaN(v))) return toast('Zahlen bitte als ganze Zahlen ab 0 eingeben.', 'fehler')
    await repo.artikelSpeichern(form.id, {
      ...form.d,
      artikelnummer: nr,
      bezeichnung: bez,
      gebindegroesse: form.d.gebindegroesse.trim(),
      barcode: form.d.barcode?.trim() || null,
      stueckProLage: spl,
      lagenProPalette: lpp,
      sollbestand: soll,
    })
    toast('Artikel gespeichert')
    setForm(null)
  }

  const fotoGewaehlt = async (datei: File | undefined) => {
    if (!datei || !form) return
    setLaeuft(true)
    try {
      // Artikel zuerst speichern, damit es eine ID gibt
      let id = form.id
      if (!id) {
        if (!form.d.artikelnummer.trim() || !form.d.bezeichnung.trim()) {
          toast('Bitte zuerst Artikelnummer und Bezeichnung eintragen.', 'fehler')
          return
        }
        id = await repo.artikelSpeichern(null, { ...form.d, artikelnummer: form.d.artikelnummer.trim(), bezeichnung: form.d.bezeichnung.trim() })
      }
      const blob = await bildOptimieren(datei, 1000, 0.8)
      const url = await repo.referenzfotoHochladen(id, blob)
      setForm({ ...form, id, foto: url })
      toast('Referenzfoto gespeichert')
    } catch (e) {
      toast((e as Error).message || 'Foto konnte nicht gespeichert werden.', 'fehler')
    } finally {
      setLaeuft(false)
      if (fotoRef.current) fotoRef.current.value = ''
    }
  }

  const csvImport = async (datei: File | undefined) => {
    if (!datei) return
    setLaeuft(true)
    try {
      const istExcel = /\.xlsx$/i.test(datei.name) || datei.type.includes('spreadsheetml')
      const { artikel: neu, fehler } = istExcel
        ? artikelAusZeilen(await (await import('../export/excel')).excelZeilen(datei))
        : artikelAusCsv(await datei.text())
      const ergebnis = neu.length ? await repo.artikelImportieren(neu, artikel) : { neu: 0, aktualisiert: 0 }
      setImportInfo({ ...ergebnis, fehler })
    } catch {
      toast('Die Datei konnte nicht gelesen werden.', 'fehler')
    } finally {
      setLaeuft(false)
      if (csvRef.current) csvRef.current.value = ''
    }
  }

  return (
    <>
      <Seitenkopf
        titel="Artikelstamm"
        unter={`${artikel.length} Artikel, dienen der KI als Abgleich`}
        aktion={
          <button className="btn btn-primary btn-icon" onClick={() => oeffnen(null)} aria-label="Artikel anlegen">
            <Plus className="size-6" />
          </button>
        }
      />

      <div className="mb-4 flex gap-2">
        <label className="relative flex-1">
          <span className="sr-only">Artikel suchen</span>
          <Search className="pointer-events-none absolute top-1/2 left-4 size-5 -translate-y-1/2 text-ink-3" />
          <input className="field pl-12" placeholder="Nummer, Name, Barcode" value={q} onChange={(e) => setQ(e.target.value)} type="search" />
        </label>
        <button className="btn btn-secondary" onClick={() => csvRef.current?.click()} disabled={laeuft}>
          {laeuft ? <Spinner /> : <Upload className="size-5" />}
          Import
        </button>
        <input ref={csvRef} type="file" accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" className="hidden" onChange={(e) => csvImport(e.target.files?.[0])} />
      </div>

      <button
        className="mb-4 text-sm font-semibold text-accent"
        onClick={async () => {
          const { artikelVorlage } = await import('../export/excel')
          await dateiAusgeben('Artikel_Vorlage.xlsx', await artikelVorlage())
        }}
      >
        Excel Vorlage für den Import herunterladen
      </button>

      {artikel.length === 0 ? (
        <Leer
          icon={<Package className="size-7" />}
          titel="Noch keine Artikel"
          text="Lege Artikel einzeln an oder importiere eine Excel oder CSV Datei. Am einfachsten mit der Vorlage oben."
          aktion={
            <button className="btn btn-primary" onClick={() => oeffnen(null)}>
              Artikel anlegen
            </button>
          }
        />
      ) : gefiltert.length === 0 ? (
        <p className="card px-4 py-6 text-center text-sm text-ink-2">Kein Artikel passt zur Suche.</p>
      ) : (
        <ul className="card divide-y divide-line">
          {gefiltert.map((a) => (
            <li key={a.id}>
              <button className="flex w-full items-center gap-3 px-4 py-3 text-left" onClick={() => oeffnen(a)}>
                {a.referenzfotoUrl ? (
                  <img src={a.referenzfotoUrl} alt="" className="size-11 shrink-0 rounded-xl object-cover" />
                ) : (
                  <div className="grid size-11 shrink-0 place-items-center rounded-xl bg-surface-2 text-ink-3">
                    <Package className="size-5" />
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{a.bezeichnung}</p>
                  <p className="truncate text-xs text-ink-2">
                    {a.artikelnummer} · {[a.gebindeart, a.gebindegroesse].filter(Boolean).join(' ')}
                    {a.stueckProLage ? ` · ${a.stueckProLage} je Lage` : ''}
                  </p>
                </div>
                {a.sollbestand !== null && (
                  <span className="tabular shrink-0 text-right text-xs text-ink-3">
                    Soll
                    <br />
                    <span className="text-sm font-semibold text-ink-2">{a.sollbestand}</span>
                  </span>
                )}
              </button>
            </li>
          ))}
        </ul>
      )}

      <Sheet offen={!!form} onClose={() => setForm(null)} titel={form?.id ? 'Artikel bearbeiten' : 'Neuer Artikel'}>
        {form && (
          <form onSubmit={speichern} className="flex flex-col gap-4">
            <div className="grid grid-cols-[2fr_3fr] gap-3">
              <div className="min-w-0">
                <label className="label" htmlFor="a-nr">
                  Artikelnummer
                </label>
                <input id="a-nr" className="field" value={form.d.artikelnummer} maxLength={64} onChange={(e) => setForm({ ...form, d: { ...form.d, artikelnummer: e.target.value } })} />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="a-bez">
                  Bezeichnung
                </label>
                <input id="a-bez" className="field" value={form.d.bezeichnung} maxLength={160} onChange={(e) => setForm({ ...form, d: { ...form.d, bezeichnung: e.target.value } })} />
              </div>
            </div>
            <div>
              <span className="label">Gebindeart</span>
              <div className="flex flex-wrap gap-2">
                {GEBINDE.map((g) => (
                  <button type="button" key={g} className="chip" aria-pressed={form.d.gebindeart === g} onClick={() => setForm({ ...form, d: { ...form.d, gebindeart: g } })}>
                    {g}
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="label" htmlFor="a-gr">
                  Gebindegröße
                </label>
                <input id="a-gr" className="field" placeholder="z. B. 25 l" value={form.d.gebindegroesse} maxLength={40} onChange={(e) => setForm({ ...form, d: { ...form.d, gebindegroesse: e.target.value } })} />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="a-soll">
                  Sollbestand (Stück)
                </label>
                <input id="a-soll" className="field" inputMode="numeric" value={zahlen.soll} onChange={(e) => setZahlen({ ...zahlen, soll: e.target.value })} />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="a-spl">
                  Stück pro Lage
                </label>
                <input id="a-spl" className="field" inputMode="numeric" value={zahlen.spl} onChange={(e) => setZahlen({ ...zahlen, spl: e.target.value })} />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="a-lpp">
                  Lagen pro Palette
                </label>
                <input id="a-lpp" className="field" inputMode="numeric" value={zahlen.lpp} onChange={(e) => setZahlen({ ...zahlen, lpp: e.target.value })} />
              </div>
            </div>
            <div>
              <label className="label" htmlFor="a-bc">
                Barcode (optional)
              </label>
              <input id="a-bc" className="field" placeholder="EAN oder interne Nummer" value={form.d.barcode ?? ''} maxLength={64} onChange={(e) => setForm({ ...form, d: { ...form.d, barcode: e.target.value } })} />
            </div>
            <div>
              <span className="label">Referenzfoto (optional)</span>
              <div className="flex items-center gap-3">
                {form.foto ? (
                  <img src={form.foto} alt="Referenzfoto" className="size-16 rounded-xl object-cover" />
                ) : (
                  <div className="grid size-16 place-items-center rounded-xl bg-surface-2 text-ink-3">
                    <Package className="size-6" />
                  </div>
                )}
                <button type="button" className="btn btn-secondary flex-1" onClick={() => fotoRef.current?.click()} disabled={laeuft}>
                  {laeuft ? <Spinner /> : <ImagePlus className="size-5" />} {form.foto ? 'Foto ersetzen' : 'Foto hinzufügen'}
                </button>
                <input ref={fotoRef} type="file" accept="image/*" className="hidden" onChange={(e) => fotoGewaehlt(e.target.files?.[0])} />
              </div>
            </div>
            <div className="mt-1 grid grid-cols-[auto_1fr] gap-3">
              {form.id && (
                <button
                  type="button"
                  className="btn btn-danger btn-icon"
                  aria-label="Artikel löschen"
                  onClick={() => {
                    const a = artikel.find((x) => x.id === form.id)
                    if (a) setLoeschen(a)
                  }}
                >
                  <Trash2 className="size-5" />
                </button>
              )}
              <button className={`btn btn-primary btn-lg ${form.id ? '' : 'col-span-2'}`}>Speichern</button>
            </div>
          </form>
        )}
      </Sheet>

      <Bestaetigen
        offen={!!loeschen}
        titel="Artikel löschen?"
        text={`${loeschen?.artikelnummer} ${loeschen?.bezeichnung} wird aus dem Artikelstamm entfernt. Bereits erfasste Positionen bleiben erhalten.`}
        ja="Löschen"
        gefaehrlich
        onNein={() => setLoeschen(null)}
        onJa={async () => {
          if (loeschen) await repo.artikelLoeschen(loeschen.id)
          setLoeschen(null)
          setForm(null)
          toast('Artikel gelöscht')
        }}
      />

      <Sheet offen={!!importInfo} onClose={() => setImportInfo(null)} titel="Import">
        {importInfo && (
          <div className="flex flex-col gap-3">
            <p>
              <strong>{importInfo.neu}</strong> neu angelegt, <strong>{importInfo.aktualisiert}</strong> aktualisiert.
            </p>
            {importInfo.fehler.length > 0 && (
              <div className="rounded-[14px] bg-warn-soft px-4 py-3 text-sm text-warn">
                <p className="font-semibold">{importInfo.fehler.length} Hinweise</p>
                <ul className="mt-1 list-disc pl-4">
                  {importInfo.fehler.slice(0, 12).map((f) => (
                    <li key={f}>{f}</li>
                  ))}
                </ul>
              </div>
            )}
            <button className="btn btn-primary" onClick={() => setImportInfo(null)}>
              Fertig
            </button>
          </div>
        )}
      </Sheet>
    </>
  )
}
