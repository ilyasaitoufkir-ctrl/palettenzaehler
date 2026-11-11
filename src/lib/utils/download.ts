import { PLATTFORM } from '../config'

export type AusgabeErgebnis = 'gespeichert' | 'geteilt' | 'abgebrochen' | 'nicht_moeglich'

interface DownloadsCap {
  save(r: { filename: string; data: Blob }): Promise<unknown>
}

/**
 * Gibt eine erzeugte Datei aus:
 * auf der Claude Seite über die Download Freigabe, auf dem Handy über das Teilen Menü
 * (iPhone: "In Dateien sichern", Mail, AirDrop), sonst als normaler Download.
 */
export async function dateiAusgeben(name: string, blob: Blob): Promise<AusgabeErgebnis> {
  if (PLATTFORM === 'artifact') {
    const c = (globalThis as unknown as { claude?: { use(n: string): Promise<unknown> } }).claude
    const dl = c ? ((await c.use('downloads').catch(() => null)) as DownloadsCap | null) : null
    if (!dl) return 'nicht_moeglich'
    try {
      await dl.save({ filename: name, data: blob })
      return 'gespeichert'
    } catch (e) {
      return (e as { code?: string }).code === 'declined' ? 'abgebrochen' : 'nicht_moeglich'
    }
  }

  const istTouch = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches
  if (istTouch && typeof File !== 'undefined' && navigator.canShare) {
    const datei = new File([blob], name, { type: blob.type })
    if (navigator.canShare({ files: [datei] })) {
      try {
        await navigator.share({ files: [datei], title: name })
        return 'geteilt'
      } catch (e) {
        if ((e as DOMException).name === 'AbortError') return 'abgebrochen'
        // sonst auf normalen Download zurückfallen
      }
    }
  }

  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
  return 'gespeichert'
}
