import { useEffect, useState, type FormEvent } from 'react'
import { useSearchParams } from 'react-router-dom'
import { Boxes, Check, Lock, Pencil, Plus, Unlock } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Bestaetigen, Leer, Seitenkopf, Sheet } from '../../components/ui'
import type { Inventur, InventurEingabe } from '../../types'
import { heuteIso } from '../../lib/utils/format'

const leer = (): InventurEingabe => ({ name: '', datum: heuteIso(), lagerort: '', status: 'aktiv' })

export function InventurenPage() {
  const { inventuren, aktiveInventur, aktiveInventurWaehlen, repo, toast } = useApp()
  const [params, setParams] = useSearchParams()
  const [bearbeiten, setBearbeiten] = useState<{ id: string | null; daten: InventurEingabe } | null>(null)
  const [abschliessen, setAbschliessen] = useState<Inventur | null>(null)

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
                    onClick={() => setBearbeiten({ id: i.id, daten: { name: i.name, datum: i.datum, lagerort: i.lagerort, status: i.status } })}
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
                placeholder="z. B. Jahresinventur Gebäude 5"
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
            <button className="btn btn-primary btn-lg mt-1">{bearbeiten.id ? 'Speichern' : 'Anlegen und aktivieren'}</button>
          </form>
        )}
      </Sheet>

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
