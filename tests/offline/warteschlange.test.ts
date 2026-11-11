// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { queueAlle, queueHolen, queueLoeschen, queueSpeichern, type QueueEintrag } from '../../src/features/offline/queue'
import { analysieren, positionBestaetigen, warteschlangeAbarbeiten } from '../../src/features/offline/verarbeitung'
import { ErkennungsFehler } from '../../src/features/erfassung/erkennung'
import type { DataRepo } from '../../src/lib/data/repo'
import type { ErkennungsErgebnis, PositionEingabe } from '../../src/types'

const ergebnis: ErkennungsErgebnis = {
  ki: {
    artikel_match: null,
    beschreibung: 'Kanister',
    gebindeart: 'Kanister',
    etikett_text: null,
    produkt: '',
    paletten_nummer: null,
    barcode_nummern: [],
    charge: null,
    stueck_pro_lage: 10,
    lagen: 3,
    fehlende_stueck: 0,
    gesamt_geschaetzt: 30,
    konfidenz: 'hoch',
    hinweise: '',
  },
  barcodeArtikelnummer: null,
  barcodeWerte: [],
}
const eingabe: PositionEingabe = {
  artikelId: null,
  artikelnummer: '',
  bezeichnung: 'Kanister',
  gebindeart: '',
  lagen: 3,
  stueckProLage: 10,
  fehlend: 0,
  menge: 30,
  lagerplatz: '',
  konfidenz: 'hoch',
  quelle: 'ki',
  kiGesamt: 30,
  kiHinweise: '',
  etikettText: null, palettenNummer: '', charge: '', sollMenge: null, lagerplatzLaut: '', pruefStatus: 'nicht_noetig' as const, geprueftVon: '', geprueftAm: null, protokoll: [], 
}

function eintrag(id: string, status: QueueEintrag['status'] = 'wartet'): QueueEintrag {
  return { id, inventurId: 'inv', bilder: [new Blob(['x'], { type: 'image/jpeg' })], status, fehler: null, wiederholbar: true, ergebnis: null, versuche: 0, erstelltAm: Date.now(), aktualisiertAm: Date.now() }
}

function fakeRepo() {
  const positionen = new Map<string, PositionEingabe & { fotoUrls?: string[] }>()
  const repo = {
    art: 'firebase',
    positionAnlegen: vi.fn(async (_i: string, id: string, e: PositionEingabe) => {
      positionen.set(id, { ...e })
    }),
    positionAktualisieren: vi.fn(async (_i: string, id: string, d: { fotoUrls?: string[] }) => {
      positionen.set(id, { ...positionen.get(id)!, ...d })
    }),
    fotosHochladen: vi.fn(async () => ['https://foto/1.jpg']),
  } as unknown as DataRepo
  return { repo, positionen }
}

const online = (wert: boolean) => Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => wert })
const warten = () => new Promise((r) => setTimeout(r, 20))

beforeEach(async () => {
  online(true)
  for (const e of await queueAlle()) await queueLoeschen(e.id)
})

describe('Offline Warteschlange', () => {
  it('Fotos ohne Netz bleiben wartend und werden bei Verbindung analysiert', async () => {
    online(false)
    await queueSpeichern(eintrag('a'))
    const erkennen = vi.fn(async () => ergebnis)
    await analysieren('a', erkennen, [])
    expect((await queueHolen('a'))?.status).toBe('wartet')
    expect(erkennen).not.toHaveBeenCalled()

    online(true)
    const { repo } = fakeRepo()
    await warteschlangeAbarbeiten(repo, erkennen, [])
    const e = await queueHolen('a')
    expect(e?.status).toBe('bereit')
    expect(e?.ergebnis?.ki.gesamt_geschaetzt).toBe(30)
  })

  it('parallele Analyseaufrufe starten nur eine Erkennung', async () => {
    await queueSpeichern(eintrag('b'))
    const erkennen = vi.fn(async () => {
      await warten()
      return ergebnis
    })
    await Promise.all([analysieren('b', erkennen, []), analysieren('b', erkennen, []), analysieren('b', erkennen, [])])
    expect(erkennen).toHaveBeenCalledTimes(1)
  })

  it('Fehler werden mit Text gespeichert, dauerhafte Fehler nicht automatisch wiederholt', async () => {
    await queueSpeichern(eintrag('c'))
    await analysieren('c', async () => {
      throw new ErkennungsFehler('Keine Berechtigung', false)
    }, [])
    const e = await queueHolen('c')
    expect(e).toMatchObject({ status: 'fehler', fehler: 'Keine Berechtigung', wiederholbar: false })
  })

  it('doppeltes Bestätigen erzeugt keine doppelte Position', async () => {
    await queueSpeichern({ ...eintrag('d', 'bereit'), ergebnis })
    const { repo, positionen } = fakeRepo()
    await Promise.all([positionBestaetigen(repo, 'd', eingabe), positionBestaetigen(repo, 'd', eingabe)])
    await positionBestaetigen(repo, 'd', eingabe)
    await warten()
    expect(positionen.size).toBe(1)
    expect([...positionen.keys()]).toEqual(['d'])
    const e = await queueHolen('d')
    expect(e?.status).toBe('gespeichert')
    expect(e?.bilder).toHaveLength(0)
    expect(positionen.get('d')?.fotoUrls).toEqual(['https://foto/1.jpg'])
  })

  it('fehlgeschlagener Foto Upload bleibt im Status Upload und wird nachgeholt', async () => {
    await queueSpeichern({ ...eintrag('e', 'bereit'), ergebnis })
    const { repo } = fakeRepo()
    ;(repo.fotosHochladen as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('offline'))
    await positionBestaetigen(repo, 'e', eingabe)
    await warten()
    expect((await queueHolen('e'))?.status).toBe('upload')
    await warteschlangeAbarbeiten(repo, vi.fn(), [])
    expect((await queueHolen('e'))?.status).toBe('gespeichert')
    expect(repo.positionAnlegen).toHaveBeenCalledTimes(1)
  })
})
