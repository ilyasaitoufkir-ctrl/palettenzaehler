import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Check, Lock, Pencil, Plus, Trash2, Unlock } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, Leer, Seitenkopf, Sheet } from '../../components/ui'
import type { Inventur, InventurEingabe } from '../../types'
import { heuteIso } from '../../lib/utils/format'

const leer = (): InventurEingabe => ({ name: '', datum: heuteIso(), lagerort: '', status: 'aktiv', blind: false, schwelleStueck: 1, schwelleProzent: null })

export function InventurenPage() {
  const { inventuren, aktiveInventur, aktiveInventurWaehlen, repo, toast } = useApp()
  const [params, setParams] = useSearchParams()
  const [bearbeiten, setBearbeiten] = useState<{ id: string | null; daten: InventurEingabe } | null>(null)
  const [abschliessen, setAbschliessen] = useState<Inventur | null>(null)
  const [loeschen, setLoeschen] = useState<Inventur | null>(null)

  useEffect(() => {
    if (params.get('neu') === '1') {
      setBearbeiten({ id: null, daten: leer() })
      setParams({}, { replace: true })
    }
  }, [params, setParams])

  const speichern = async (e: FormEvent) => {
    e.preventDefault()
    if (!bearbeiten) return
    const d = { ...bearbeiten.daten, name: bearbeiten.daten.name.trim(), lagerort: bearbeiten.daten.lagerort.trim() }
    if (!d.name) return toast('Bitte einen Namen eingeben.', 'fehler')
    if (bearbeiten.id) {
      await repo.inventurAktualisieren(bearbeiten.id, d)
      toast('Inventur gespeichert')
    } else {
      const id = await repo.inventurAnlegen(d)
      aktiveInventurWaehlen(id)
      toast('Inventur angelegt und aktiviert')
    }
    setBearbeiten(null)
  }

  return (
    <>
      <Seitenkopf
        titel="Inventuren"
        unter="Tippe auf eine Inventur, um mit ihr zu arbeiten."
        aktion={
          <button className="btn btn-primary btn-icon" onClick={() => setBearbeiten({ id: null, daten: leer() })} aria-label="Neue Inventur">
            <Plus className="size-6" />
          </button>
        }
      />
      {inventuren.length === 0 ? (
        <Leer
          icon={<Boxes className="size-7" />}
          titel="Noch keine Inventur"
          text="Lege die erste Inventur an, zum Beispiel für ein Lager oder eine Halle."
          aktion={
            <button className="btn btn-primary" onClick={() => setBearbeiten({ id: null, daten: leer() })}>
              Inventur anlegen
            </button>
          }
        />
      ) : (
        <ul className="flex flex-col gap-3">
          {inventuren.map((i) => {
            const istAktiv = aktiveInventur?.id === i.id
            return (
              <li key={i.id} className={`card overflow-hidden ${istAktiv ? 'border-accent' : ''}`}>
                <button className="flex w-full items-center gap-3 px-4 py-4 text-left" onClick={() => aktiveInventurWaehlen(i.id)} aria-pressed={istAktiv}>
                  <div className={`grid size-10 shrink-0 place-items-center rounded-full ${istAktiv ? 'bg-brand text-accent-ink' : 'bg-surface-2 text-ink-3'}`}>
                    {istAktiv ? <Check className="size-5" /> : <Boxes className="size-5" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold">{i.name}</p>
                    <p className="truncate text-sm text-ink-2">
                      {new Date(i.datum).toLocaleDateString('de-DE')} · {i.lagerort || 'ohne Lagerort'}
                    </p>
                  </div>
                  <span
                    className={`rounded-full px-2.5 py-1 text-xs font-semibold ${i.status === 'aktiv' ? 'bg-ok-soft text-ok' : 'bg-surface-2 text-ink-2'}`}
                  >
                    {i.status === 'aktiv' ? 'Aktiv' : 'Abgeschlossen'}
                  </span>
                </button>
                <div className="flex border-t border-line">
                  <button
                    className="btn btn-ghost flex-1 rounded-none text-sm"
                    onClick={() => setBearbeiten({ id: i.id, daten: { name: i.name, datum: i.datum, lagerort: i.lagerort, status: i.status, blind: i.blind ?? false, schwelleStueck: i.schwelleStueck ?? 1, schwelleProzent: i.schwelleProzent ?? null } })}
                  >
                    <Pencil className="size-4" /> Bearbeiten
                  </button>
                  {i.status === 'aktiv' ? (
                    <button className="btn btn-ghost flex-1 rounded-none border-l border-line text-sm" onClick={() => setAbschliessen(i)}>
                      <Lock className="size-4" /> Abschließen
                    </button>
                  ) : (
                    <button
                      className="btn btn-ghost flex-1 rounded-none border-l border-line text-sm"
                      onClick={async () => {
                        await repo.inventurAktualisieren(i.id, { status: 'aktiv' })
                        toast('Inventur wieder geöffnet')
                      }}
                    >
                      <Unlock className="size-4" /> Wieder öffnen
                    </button>
                  )}
                  <button
                    className="btn btn-ghost flex-1 rounded-none border-l border-line text-sm text-bad"
                    onClick={() => setLoeschen(i)}
                    aria-label={`Inventur ${i.name} löschen`}
                  >
                    <Trash2 className="size-4" /> Löschen
                  </button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <Sheet offen={!!bearbeiten} onClose={() => setBearbeiten(null)} titel={bearbeiten?.id ? 'Inventur bearbeiten' : 'Neue Inventur'}>
        {bearbeiten && (
          <form onSubmit={speichern} className="flex flex-col gap-4">
            <div>
              <label className="label" htmlFor="inv-name">
                Name
              </label>
              <input
                id="inv-name"
                className="field"
                value={bearbeiten.daten.name}
                onChange={(e) => setBearbeiten({ ...bearbeiten, daten: { ...bearbeiten.daten, name: e.target.value } })}
                placeholder="z. B. Jahresinventur Geb5"
                maxLength={120}
                autoFocus
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="min-w-0">
                <label className="label" htmlFor="inv-datum">
                  Datum
                </label>
                <input
                  id="inv-datum"
                  className="field"
                  type="date"
                  value={bearbeiten.daten.datum}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, daten: { ...bearbeiten.daten, datum: e.target.value } })}
                />
              </div>
              <div className="min-w-0">
                <label className="label" htmlFor="inv-ort">
                  Lagerort
                </label>
                <input
                  id="inv-ort"
                  className="field"
                  value={bearbeiten.daten.lagerort}
                  onChange={(e) => setBearbeiten({ ...bearbeiten, daten: { ...bearbeiten.daten, lagerort: e.target.value } })}
                  placeholder="z. B. Halle A"
                  maxLength={120}
                />
              </div>
            </div>
            <fieldset className="card flex flex-col gap-3 px-4 py-4">
              <legend className="label px-0">Nachzählung ab Abweichung</legend>
              <p className="text-sm text-ink-2">Weicht die Menge um mehr als diese Schwelle vom Soll ab, kommt die Palette in die Nachzählliste.</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="min-w-0">
                  <label className="label" htmlFor="inv-schwelle-stueck">
                    Stück
                  </label>
                  <input
                    id="inv-schwelle-stueck"
                    className="field tabular"
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={bearbeiten.daten.schwelleStueck ?? 1}
                    onChange={(e) => setBearbeiten({ ...bearbeiten, daten: { ...bearbeiten.daten, schwelleStueck: Math.max(1, Math.round(Number(e.target.value) || 1)) } })}
                  />
                </div>
                <div className="min-w-0">
                  <label className="label" htmlFor="inv-schwelle-prozent">
                    Prozent (optional)
                  </label>
                  <input
                    id="inv-schwelle-prozent"
                    className="field tabular"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    placeholder="aus"
                    value={bearbeiten.daten.schwelleProzent ?? ''}
                    onChange={(e) =>
                      setBearbeiten({
                        ...bearbeiten,
                        daten: { ...bearbeiten.daten, schwelleProzent: e.target.value === '' ? null : Math.max(0, Number(e.target.value)) },
                      })
                    }
                  />
                </div>
              </div>
            </fieldset>
            <label className="flex min-h-[52px] cursor-pointer items-start gap-3 rounded-[14px] bg-surface-2 px-4 py-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5"
                checked={!!bearbeiten.daten.blind}
                onChange={(e) => setBearbeiten({ ...bearbeiten, daten: { ...bearbeiten.daten, blind: e.target.checked } })}
              />
              <span>
                <span className="block font-semibold">Blind-Zählung</span>
                <span className="block text-ink-2">Das Soll wird während der aktiven Inventur nicht angezeigt. Abweichungen sieht man erst im Bericht.</span>
              </span>
            </label>
            <button className="btn btn-primary btn-lg mt-1">{bearbeiten.id ? 'Speichern' : 'Anlegen und aktivieren'}</button>
          </form>
        )}
      </Sheet>

      <Bestaetigen
        offen={!!loeschen}
        titel="Inventur löschen?"
        text={`„${loeschen?.name ?? ''}“ wird mit allen erfassten Paletten endgültig gelöscht. Das lässt sich nicht rückgängig machen.`}
        ja="Endgültig löschen"
        gefaehrlich
        onNein={() => setLoeschen(null)}
        onJa={async () => {
          if (loeschen) {
            await repo.inventurLoeschen(loeschen.id)
            toast('Inventur gelöscht')
          }
          setLoeschen(null)
        }}
      />

      <Bestaetigen
        offen={!!abschliessen}
        titel="Inventur abschließen?"
        text="Danach können keine neuen Paletten mehr erfasst werden. Du kannst die Inventur später wieder öffnen."
        ja="Abschließen"
        onNein={() => setAbschliessen(null)}
        onJa={async () => {
          if (abschliessen) await repo.inventurAktualisieren(abschliessen.id, { status: 'abgeschlossen' })
          setAbschliessen(null)
          toast('Inventur abgeschlossen')
        }}
      />
    </>
  )
}
