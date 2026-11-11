/**
 * Barcode Erkennung im Browser, ohne Server und ohne KI Kosten.
 * Nutzt die eingebaute BarcodeDetector API, wo vorhanden (Chrome Android),
 * sonst ZXing (läuft auch auf dem iPhone). Unterstützt EAN, Code 128/GS1-128, ITF, Code 39, QR, DataMatrix.
 */

type ZX = typeof import('@zxing/library')
let zxP: Promise<ZX> | null = null
const zx = () => (zxP ??= import('@zxing/library'))

interface NativerDetector {
  detect(source: CanvasImageSource): Promise<{ rawValue: string }[]>
}

function nativerDetector(): NativerDetector | null {
  const BD = (globalThis as unknown as { BarcodeDetector?: new () => NativerDetector }).BarcodeDetector
  if (!BD) return null
  try {
    return new BD()
  } catch {
    return null
  }
}

async function hinweise(z: ZX, versuchen: boolean) {
  const h = new Map()
  h.set(z.DecodeHintType.POSSIBLE_FORMATS, [
    z.BarcodeFormat.CODE_128,
    z.BarcodeFormat.EAN_13,
    z.BarcodeFormat.EAN_8,
    z.BarcodeFormat.UPC_A,
    z.BarcodeFormat.ITF,
    z.BarcodeFormat.CODE_39,
    z.BarcodeFormat.QR_CODE,
    z.BarcodeFormat.DATA_MATRIX,
  ])
  if (versuchen) h.set(z.DecodeHintType.TRY_HARDER, true)
  return h
}


function zeichnen(quelle: CanvasImageSource, breite: number, hoehe: number, maxKante: number, drehen = false): HTMLCanvasElement {
  const f = Math.min(1, maxKante / Math.max(breite, hoehe))
  const b = Math.round(breite * f)
  const h = Math.round(hoehe * f)
  const c = document.createElement('canvas')
  c.width = drehen ? h : b
  c.height = drehen ? b : h
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  if (drehen) {
    ctx.translate(h, 0)
    ctx.rotate(Math.PI / 2)
  }
  ctx.drawImage(quelle, 0, 0, b, h)
  return c
}

async function einmal(canvas: HTMLCanvasElement, versuchen: boolean): Promise<string | null> {
  const z = await zx()
  const reader = new z.MultiFormatReader()
  reader.setHints(await hinweise(z, versuchen))
  try {
    const bitmap = new z.BinaryBitmap(new z.HybridBinarizer(new z.HTMLCanvasElementLuminanceSource(canvas)))
    return reader.decode(bitmap).getText()
  } catch {
    return null
  }
}

function ausschnitt(c: HTMLCanvasElement, x: number, y: number, b: number, h: number): HTMLCanvasElement {
  const n = document.createElement('canvas')
  n.width = Math.round(c.width * b)
  n.height = Math.round(c.height * h)
  n.getContext('2d', { willReadFrequently: true })!.drawImage(c, c.width * x, c.height * y, n.width, n.height, 0, 0, n.width, n.height)
  return n
}

/**
 * ZXing findet je Durchlauf einen Code. Für mehrere Codes auf einem Foto (z. B. NVE und EAN)
 * zusätzlich Hälften und Viertel des Bildes durchsuchen.
 */
async function zxingAufCanvas(canvas: HTMLCanvasElement, mehrere: boolean, versuchen: boolean): Promise<string[]> {
  const gefunden = new Set<string>()
  const ganz = await einmal(canvas, versuchen)
  if (ganz) gefunden.add(ganz)
  if (!mehrere) return Array.from(gefunden)
  const teile: [number, number, number, number][] = [
    [0, 0, 1, 0.5],
    [0, 0.5, 1, 0.5],
    [0, 0, 0.5, 1],
    [0.5, 0, 0.5, 1],
    [0, 0, 0.55, 0.55],
    [0.45, 0, 0.55, 0.55],
    [0, 0.45, 0.55, 0.55],
    [0.45, 0.45, 0.55, 0.55],
  ]
  for (const [x, y, b, h] of teile) {
    const r = await einmal(ausschnitt(canvas, x, y, b, h), versuchen)
    if (r) gefunden.add(r)
  }
  return Array.from(gefunden)
}

/** Sucht alle Barcodes auf Fotos. Gibt die rohen Inhalte zurück (ohne Dubletten). */
export async function barcodesAusBildern(bilder: Blob[]): Promise<string[]> {
  const werte = new Set<string>()
  const nativ = nativerDetector()
  for (const b of bilder) {
    let bmp: ImageBitmap
    try {
      bmp = await createImageBitmap(b)
    } catch {
      continue
    }
    try {
      if (nativ) {
        const t = await nativ.detect(bmp).catch(() => [])
        t.forEach((x) => x.rawValue && werte.add(x.rawValue.trim()))
      }
      if (!nativ || werte.size === 0) {
        // erst normal, dann gedreht (senkrechte Barcodes), auf zwei Auflösungen
        for (const [kante, drehen] of [
          [1600, false],
          [1600, true],
        ] as const) {
          const gefunden = await zxingAufCanvas(zeichnen(bmp, bmp.width, bmp.height, kante, drehen), true, true)
          gefunden.forEach((x) => werte.add(x.trim()))
          if (gefunden.length) break
        }
      }
    } finally {
      bmp.close()
    }
  }
  return Array.from(werte).filter(Boolean)
}

/** Ein Videobild nach einem Barcode durchsuchen (für den Live Scanner, schnell statt gründlich) */
export async function barcodeAusVideo(video: HTMLVideoElement, bekannt: Set<string> = new Set()): Promise<string | null> {
  if (!video.videoWidth) return null
  const nativ = nativerDetector()
  if (nativ) {
    const t = await nativ.detect(video).catch(() => [])
    const neu = t.map((x) => x.rawValue?.trim()).find((x) => x && !bekannt.has(x))
    if (neu) return neu
    if (t.length) return null
  }
  const canvas = zeichnen(video, video.videoWidth, video.videoHeight, 1024)
  const r = await zxingAufCanvas(canvas, bekannt.size > 0, false)
  const neu = r.map((x) => x.trim()).find((x) => !bekannt.has(x))
  if (neu) return neu
  if (r.length) return null
  const gedreht = await zxingAufCanvas(zeichnen(video, video.videoWidth, video.videoHeight, 1024, true), false, false)
  return gedreht[0]?.trim() ?? null
}

/** Ob das Gerät einen Live Scanner mit Kamera erlaubt */
export function liveScanMoeglich(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && window.isSecureContext
}
