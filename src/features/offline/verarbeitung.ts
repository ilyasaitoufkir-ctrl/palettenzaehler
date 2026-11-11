import type { Artikel, PositionEingabe } from '../../types'
import type { DataRepo } from '../../lib/data'
import { ErkennungsFehler, type RecognizePallet } from '../erfassung/erkennung'
import { queueAlle, queueAktualisieren, queueHolen, type QueueEintrag } from './queue'

const inArbeit = new Set<string>()

const istOnline = () => (typeof navigator === 'undefined' ? true : navigator.onLine)

/** Analysiert einen einzelnen wartenden Eintrag. Mehrfachaufrufe für dieselbe ID laufen nicht parallel. */
export async function analysieren(id: string, erkennen: RecognizePallet, artikel: Artikel[]): Promise<void> {
  if (inArbeit.has(id)) return
  inArbeit.add(id)
  try {
    const e = await queueHolen(id)
    if (!e || (e.status !== 'wartet' && e.status !== 'fehler')) return
    if (!istOnline()) {
      await queueAktualisieren(id, { status: 'wartet', fehler: null })
      return
    }
    await queueAktualisieren(id, { status: 'analyse', fehler: null, versuche: e.versuche + 1 })
    try {
      const ergebnis = await erkennen(e.bilder, artikel)
      await queueAktualisieren(id, { status: 'bereit', ergebnis, fehler: null, wiederholbar: true })
    } catch (err) {
      const text = err instanceof Error ? err.message : 'Analyse fehlgeschlagen.'
      const wiederholbar = err instanceof ErkennungsFehler ? err.wiederholbar : true
      // offline während der Analyse: zurück in die Warteschlange
      if (!istOnline()) await queueAktualisieren(id, { status: 'wartet', fehler: null })
      else await queueAktualisieren(id, { status: 'fehler', fehler: text, wiederholbar })
    }
  } finally {
    inArbeit.delete(id)
  }
}

/** Lädt die Fotos einer bereits gespeicherten Position hoch und hängt die Links an */
async function fotosNachreichen(repo: DataRepo, e: QueueEintrag): Promise<void> {
  if (inArbeit.has('upload:' + e.id)) return
  inArbeit.add('upload:' + e.id)
  try {
    if (!istOnline() && !repo.demo) return
    const urls = e.bilder.length ? await repo.fotosHochladen(e.inventurId, e.id, e.bilder) : []
    await repo.positionAktualisieren(e.inventurId, e.id, { fotoUrls: urls })
    // Bilder nach erfolgreichem Upload aus dem Gerätespeicher entfernen
    await queueAktualisieren(e.id, { status: 'gespeichert', bilder: [], fehler: null })
  } catch {
    // bleibt im Status upload, nächster Durchlauf versucht es erneut
    await queueAktualisieren(e.id, { fehler: 'Fotos werden nachgeladen, sobald die Verbindung stabil ist.' })
  } finally {
    inArbeit.delete('upload:' + e.id)
  }
}

/**
 * Bestätigt einen Eintrag: legt die Position unter der Queue ID an (idempotent)
 * und reicht danach die Fotos nach. Ein doppelter Klick oder ein erneuter Versuch erzeugt keine Dublette.
 */
export async function positionBestaetigen(repo: DataRepo, id: string, eingabe: PositionEingabe): Promise<void> {
  const e = await queueHolen(id)
  if (!e) throw new Error('Dieser Eintrag existiert nicht mehr.')
  if (e.status === 'upload' || e.status === 'gespeichert') return
  await repo.positionAnlegen(e.inventurId, e.id, eingabe)
  const neu = await queueAktualisieren(id, { status: 'upload', fehler: null })
  if (neu) void fotosNachreichen(repo, neu)
}

/** Ein Durchlauf über die gesamte Warteschlange */
export async function warteschlangeAbarbeiten(repo: DataRepo, erkennen: RecognizePallet, artikel: Artikel[]): Promise<void> {
  const alle = await queueAlle()
  for (const e of alle) {
    // nach Absturz hängengebliebene Analysen zurücksetzen
    if (e.status === 'analyse' && !inArbeit.has(e.id) && Date.now() - e.aktualisiertAm > 90_000) {
      await queueAktualisieren(e.id, { status: 'wartet' })
      e.status = 'wartet'
    }
    if (e.status === 'wartet') await analysieren(e.id, erkennen, artikel)
    else if (e.status === 'upload') await fotosNachreichen(repo, e)
  }
}
