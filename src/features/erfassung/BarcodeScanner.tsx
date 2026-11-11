import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { barcodeAusVideo } from '../../lib/utils/barcode'
import { Spinner } from '../../components/ui'

/**
 * Vollbild Live Scanner: Kamera läuft, jedes Bild wird nach einem Barcode durchsucht.
 * Beim ersten Treffer vibriert das Handy (wo möglich) und der Wert wird zurückgegeben.
 */
export function BarcodeScanner({
  onTreffer,
  onClose,
  titel = 'Barcode scannen',
  hinweis = 'Barcode oder NVE Etikett in den Rahmen halten. Funktioniert auch mit QR und DataMatrix.',
}: {
  onTreffer: (werte: string[]) => void
  onClose: () => void
  titel?: string
  hinweis?: string
}) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [fehler, setFehler] = useState<string | null>(null)
  const [bereit, setBereit] = useState(false)
  // aktuellen Callback merken, damit die Kamera nicht bei jedem Neuzeichnen neu startet
  const trefferRef = useRef(onTreffer)
  trefferRef.current = onTreffer

  useEffect(() => {
    let stream: MediaStream | null = null
    let laeuft = true
    let timer: ReturnType<typeof setTimeout> | null = null

    // nach dem ersten Treffer noch kurz weiter suchen, damit z. B. NVE und EAN auf einem Etikett beide erfasst werden
    const gefunden = new Set<string>()
    let ersterTreffer = 0
    const schleife = async () => {
      if (!laeuft || !videoRef.current) return
      const wert = await barcodeAusVideo(videoRef.current, gefunden).catch(() => null)
      if (!laeuft) return
      if (wert && !gefunden.has(wert)) {
        if (!gefunden.size) {
          ersterTreffer = Date.now()
          navigator.vibrate?.(60)
        }
        gefunden.add(wert)
      }
      if (gefunden.size && Date.now() - ersterTreffer > 900) {
        laeuft = false
        trefferRef.current(Array.from(gefunden))
        return
      }
      timer = setTimeout(schleife, gefunden.size ? 60 : 180)
    }

    ;(async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        })
        const v = videoRef.current
        if (!v || !laeuft) {
          stream.getTracks().forEach((t) => t.stop())
          return
        }
        v.srcObject = stream
        await v.play()
        setBereit(true)
        schleife()
      } catch (e) {
        const name = (e as DOMException).name
        setFehler(
          name === 'NotAllowedError'
            ? 'Kein Kamerazugriff. Bitte in den Einstellungen die Kamera für diese App erlauben.'
            : 'Die Kamera konnte nicht gestartet werden.',
        )
      }
    })()

    return () => {
      laeuft = false
      if (timer) clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-black text-white" role="dialog" aria-modal="true" aria-label={titel}>
      <div className="flex items-center justify-between px-4" style={{ paddingTop: 'calc(env(safe-area-inset-top, 0px) + 12px)', paddingBottom: 12 }}>
        <p className="font-semibold">{titel}</p>
        <button className="btn btn-icon bg-white/15 text-white" onClick={onClose} aria-label="Scanner schließen">
          <X className="size-6" />
        </button>
      </div>
      <div className="relative flex-1 overflow-hidden">
        <video ref={videoRef} className="absolute inset-0 size-full object-cover" playsInline muted />
        {/* Zielrahmen */}
        <div className="pointer-events-none absolute inset-0 grid place-items-center">
          <div className="h-44 w-[82%] max-w-md rounded-2xl border-4 border-white/85 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]" />
        </div>
        {!bereit && !fehler && (
          <div className="absolute inset-0 grid place-items-center">
            <Spinner className="size-8" />
          </div>
        )}
        {fehler && <p className="absolute inset-x-4 top-1/3 rounded-2xl bg-black/70 px-4 py-3 text-center">{fehler}</p>}
      </div>
      <p className="px-6 py-5 text-center text-sm text-white/80" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 20px)' }}>
        {hinweis}
      </p>
    </div>
  )
}
