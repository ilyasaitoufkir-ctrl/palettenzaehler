export const MAX_KANTE = 1600
export const JPEG_QUALITAET = 0.8
export const MAX_FOTOS = 3
/** Rohdateien größer als das werden gar nicht erst verarbeitet */
export const MAX_ROHDATEI_BYTES = 30 * 1024 * 1024

export class BildFehler extends Error {}

/** Verkleinert ein Foto clientseitig auf max. 1600 px lange Kante als JPEG (Qualität 0,8). */
export async function bildOptimieren(datei: Blob, maxKante = MAX_KANTE, qualitaet = JPEG_QUALITAET): Promise<Blob> {
  if (!datei.type.startsWith('image/')) throw new BildFehler('Die Datei ist kein Bild.')
  if (datei.size > MAX_ROHDATEI_BYTES) throw new BildFehler('Das Bild ist zu groß (max. 30 MB).')

  let quelle: ImageBitmap | HTMLImageElement
  let breite: number
  let hoehe: number
  try {
    const bmp = await createImageBitmap(datei, { imageOrientation: 'from-image' })
    quelle = bmp
    breite = bmp.width
    hoehe = bmp.height
  } catch {
    const img = await ladeBild(datei)
    quelle = img
    breite = img.naturalWidth
    hoehe = img.naturalHeight
  }
  if (!breite || !hoehe) throw new BildFehler('Das Bild konnte nicht gelesen werden.')

  const faktor = Math.min(1, maxKante / Math.max(breite, hoehe))
  const b = Math.round(breite * faktor)
  const h = Math.round(hoehe * faktor)
  const canvas = document.createElement('canvas')
  canvas.width = b
  canvas.height = h
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new BildFehler('Bildverarbeitung wird vom Gerät nicht unterstützt.')
  ctx.drawImage(quelle, 0, 0, b, h)
  if ('close' in quelle) quelle.close()

  const blob = await new Promise<Blob | null>((res) => canvas.toBlob(res, 'image/jpeg', qualitaet))
  if (!blob) throw new BildFehler('Das Bild konnte nicht komprimiert werden.')
  return blob
}

function ladeBild(datei: Blob): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(datei)
    const img = new Image()
    img.onload = () => {
      URL.revokeObjectURL(url)
      res(img)
    }
    img.onerror = () => {
      URL.revokeObjectURL(url)
      rej(new BildFehler('Das Bild konnte nicht gelesen werden.'))
    }
    img.src = url
  })
}

export function blobZuBase64(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => {
      const s = String(r.result)
      res(s.slice(s.indexOf(',') + 1))
    }
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

export function blobZuDataUrl(blob: Blob): Promise<string> {
  return new Promise((res, rej) => {
    const r = new FileReader()
    r.onload = () => res(String(r.result))
    r.onerror = () => rej(r.error)
    r.readAsDataURL(blob)
  })
}

/** Liest Barcodes aus Fotos, wenn der Browser die BarcodeDetector API anbietet (z. B. Chrome auf Android). */
export async function barcodesLesen(bilder: Blob[]): Promise<string[] | null> {
  const BD = (globalThis as unknown as { BarcodeDetector?: BarcodeDetectorCtor }).BarcodeDetector
  if (!BD) return null
  try {
    const detector = new BD()
    const werte = new Set<string>()
    for (const b of bilder) {
      const bmp = await createImageBitmap(b)
      const treffer = await detector.detect(bmp)
      bmp.close()
      for (const t of treffer) if (t.rawValue) werte.add(t.rawValue.trim())
    }
    return Array.from(werte)
  } catch {
    return null
  }
}

interface BarcodeDetectorCtor {
  new (): { detect(source: ImageBitmap): Promise<{ rawValue: string }[]> }
}

/** Kantenlänge, auf die für die Schärfeprüfung verkleinert wird (schneller, robust gegen Bildrauschen) */
export const UNSCHARF_KANTE = 480
/**
 * Laplace-Varianz unter diesem Wert gilt als unscharf. Heuristischer Startwert,
 * an echten Lagerfotos nachkalibrieren (Warnung ist nicht blockierend).
 */
export const UNSCHARF_SCHWELLE = 60

/**
 * Laplace-Varianz eines Graustufenbildes (Zeilen-weise, Länge b*h).
 * Scharfe Kanten erzeugen große Werte, unscharfe Bilder kleine.
 */
export function laplaceVarianz(grau: ArrayLike<number>, b: number, h: number): number {
  if (b < 3 || h < 3) return 0
  let summe = 0
  let summeQuadrat = 0
  let n = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < b - 1; x++) {
      const i = y * b + x
      const lap = 4 * grau[i] - grau[i - 1] - grau[i + 1] - grau[i - b] - grau[i + b]
      summe += lap
      summeQuadrat += lap * lap
      n++
    }
  }
  const mittel = summe / n
  return summeQuadrat / n - mittel * mittel
}

/** true, wenn das Foto nach Laplace-Varianz unscharf wirkt. Fehler ergeben false (keine Warnung). */
export async function istUnscharf(blob: Blob): Promise<boolean> {
  try {
    const bmp = await createImageBitmap(blob)
    const faktor = Math.min(1, UNSCHARF_KANTE / Math.max(bmp.width, bmp.height))
    const b = Math.max(1, Math.round(bmp.width * faktor))
    const h = Math.max(1, Math.round(bmp.height * faktor))
    const canvas = document.createElement('canvas')
    canvas.width = b
    canvas.height = h
    const ctx = canvas.getContext('2d', { willReadFrequently: true })
    if (!ctx) {
      bmp.close()
      return false
    }
    ctx.drawImage(bmp, 0, 0, b, h)
    bmp.close()
    const daten = ctx.getImageData(0, 0, b, h).data
    const grau = new Float32Array(b * h)
    for (let i = 0, p = 0; i < grau.length; i++, p += 4) {
      grau[i] = 0.299 * daten[p] + 0.587 * daten[p + 1] + 0.114 * daten[p + 2]
    }
    return laplaceVarianz(grau, b, h) < UNSCHARF_SCHWELLE
  } catch {
    return false
  }
}
