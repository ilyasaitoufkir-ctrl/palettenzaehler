import type { Artikel, Inventur, Position } from '../../types'
import { sollIstAbgleich } from '../../lib/utils/csv'

/** exceljs wird erst beim Export geladen, damit die App schnell startet */
async function excel() {
  const mod = await import('exceljs')
  return (mod as unknown as { default?: typeof mod }).default ?? mod
}

const ORANGE = 'FFEF7D00'
const ORANGE_HELL = 'FFFFF0E0'
const ROT_HELL = 'FFFBE3E0'
const GRUEN_HELL = 'FFE3F3E8'

const KONF_TEXT: Record<Position['konfidenz'], string> = { hoch: 'hoch', mittel: 'mittel', niedrig: 'niedrig (nachzählen)', manuell: 'manuell' }

async function bildDaten(url: string): Promise<{ base64: string; extension: 'jpeg' | 'png' } | null> {
  try {
    if (url.startsWith('data:image/')) {
      const ext = url.startsWith('data:image/png') ? 'png' : 'jpeg'
      return { base64: url, extension: ext }
    }
    const res = await fetch(url)
    if (!res.ok) return null
    const blob = await res.blob()
    const dataUrl = await new Promise<string>((ok, err) => {
      const r = new FileReader()
      r.onload = () => ok(String(r.result))
      r.onerror = () => err(r.error)
      r.readAsDataURL(blob)
    })
    return { base64: dataUrl, extension: blob.type === 'image/png' ? 'png' : 'jpeg' }
  } catch {
    // z. B. fehlende CORS Freigabe: Export läuft ohne dieses Bild weiter
    return null
  }
}

interface ExportOptionen {
  mitFotos: boolean
}

/**
 * Erzeugt eine Excel Datei (.xlsx) mit drei Blättern:
 * Inventur (alle Positionen, optional mit Foto je Palette), Soll-Ist und Info.
 */
export async function inventurExcel(inventur: Inventur, positionen: Position[], artikel: Artikel[], opt: ExportOptionen): Promise<Blob> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  wb.creator = 'Palettenzähler'
  wb.created = new Date()

  const kopfStil = (zeile: import('exceljs').Row) => {
    zeile.font = { bold: true, color: { argb: 'FFFFFFFF' } }
    zeile.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
    zeile.alignment = { vertical: 'middle' }
    zeile.height = 22
  }

  // ── Blatt 1: Inventur ─────────────────────────────────────────────
  const ws = wb.addWorksheet('Inventur', { views: [{ state: 'frozen', ySplit: 1 }] })
  const fotoSpalte = opt.mitFotos
  ws.columns = [
    ...(fotoSpalte ? [{ header: 'Foto', key: 'foto', width: 16 }] : []),
    { header: 'Artikelnummer', key: 'nr', width: 16 },
    { header: 'Bezeichnung', key: 'bez', width: 30 },
    { header: 'Gebinde', key: 'gebinde', width: 16 },
    { header: 'Lagerplatz', key: 'platz', width: 12 },
    { header: 'Lagen', key: 'lagen', width: 8 },
    { header: 'Stück pro Lage', key: 'spl', width: 13 },
    { header: 'Fehlend', key: 'fehlend', width: 9 },
    { header: 'Menge', key: 'menge', width: 10 },
    { header: 'Konfidenz', key: 'konf', width: 20 },
    { header: 'KI Schätzung', key: 'ki', width: 12 },
    { header: 'KI Hinweis', key: 'hinweis', width: 40 },
    { header: 'Etikett', key: 'etikett', width: 20 },
    { header: 'Erfasst am', key: 'zeit', width: 17 },
    { header: 'Erfasst von', key: 'nutzer', width: 22 },
  ]
  kopfStil(ws.getRow(1))

  const sortiert = [...positionen].sort((a, b) => a.erstelltAm - b.erstelltAm)
  for (const p of sortiert) {
    const z = ws.addRow({
      nr: p.artikelnummer,
      bez: p.bezeichnung,
      gebinde: p.gebindeart,
      platz: p.lagerplatz,
      lagen: p.lagen,
      spl: p.stueckProLage,
      fehlend: p.fehlend,
      menge: p.menge,
      konf: KONF_TEXT[p.konfidenz],
      ki: p.kiGesamt ?? '',
      hinweis: p.kiHinweise,
      etikett: p.etikettText ?? '',
      zeit: new Date(p.erstelltAm),
      nutzer: p.erstelltVon,
    })
    z.alignment = { vertical: 'middle', wrapText: true }
    z.getCell('zeit').numFmt = 'dd.mm.yyyy hh:mm'
    z.getCell('menge').font = { bold: true }
    if (p.konfidenz === 'niedrig') z.eachCell((c) => (c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ROT_HELL } }))

    if (fotoSpalte && p.fotoUrls[0]) {
      const bild = await bildDaten(p.fotoUrls[0])
      if (bild) {
        const id = wb.addImage(bild)
        z.height = 70
        ws.addImage(id, { tl: { col: 0.1, row: z.number - 1 + 0.08 }, ext: { width: 104, height: 78 } })
      }
    }
  }

  // Summenzeile mit echter Excel Formel
  const mengeSpalte = ws.getColumn('menge').letter
  const letzte = ws.rowCount
  const summe = ws.addRow({ bez: 'Summe Gebinde' })
  summe.getCell('menge').value = { formula: `SUM(${mengeSpalte}2:${mengeSpalte}${Math.max(2, letzte)})`, result: sortiert.reduce((s, p) => s + p.menge, 0) }
  summe.font = { bold: true }
  summe.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HELL } }
  ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: Math.max(1, letzte), column: ws.columnCount } }

  // ── Blatt 2: Soll-Ist ─────────────────────────────────────────────
  const si = wb.addWorksheet('Soll-Ist', { views: [{ state: 'frozen', ySplit: 1 }] })
  si.columns = [
    { header: 'Artikelnummer', key: 'nr', width: 16 },
    { header: 'Bezeichnung', key: 'bez', width: 30 },
    { header: 'Gebinde', key: 'gebinde', width: 18 },
    { header: 'Soll', key: 'soll', width: 10 },
    { header: 'Ist', key: 'ist', width: 10 },
    { header: 'Differenz', key: 'diff', width: 11 },
    { header: 'Paletten', key: 'pal', width: 10 },
    { header: 'Davon nachzählen', key: 'nz', width: 16 },
  ]
  kopfStil(si.getRow(1))
  for (const z of sollIstAbgleich(positionen, artikel)) {
    const r = si.addRow({ nr: z.artikelnummer, bez: z.bezeichnung, gebinde: z.gebindeart, soll: z.soll ?? '', ist: z.ist, pal: z.positionen, nz: z.niedrigeKonfidenz })
    if (z.soll !== null) {
      r.getCell('diff').value = { formula: `E${r.number}-D${r.number}`, result: z.differenz ?? 0 }
      r.getCell('diff').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: z.differenz === 0 ? GRUEN_HELL : ROT_HELL } }
    }
    r.getCell('diff').font = { bold: true }
  }

  // ── Blatt 3: Info ─────────────────────────────────────────────────
  const info = wb.addWorksheet('Info')
  info.columns = [
    { key: 'k', width: 22 },
    { key: 'v', width: 40 },
  ]
  const zeilen: [string, string | number | Date][] = [
    ['Inventur', inventur.name],
    ['Datum', inventur.datum ? new Date(inventur.datum) : ''],
    ['Lagerort', inventur.lagerort],
    ['Status', inventur.status],
    ['Paletten', positionen.length],
    ['Gebinde gesamt', positionen.reduce((s, p) => s + p.menge, 0)],
    ['Davon nachzählen', positionen.filter((p) => p.konfidenz === 'niedrig').length],
    ['Exportiert am', new Date()],
  ]
  for (const [k, v] of zeilen) {
    const r = info.addRow({ k, v })
    r.getCell('k').font = { bold: true }
    if (v instanceof Date) r.getCell('v').numFmt = k === 'Datum' ? 'dd.mm.yyyy' : 'dd.mm.yyyy hh:mm'
  }

  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}

/** Liest das erste Blatt einer Excel Datei als Textzeilen (für den Artikelimport) */
export async function excelZeilen(datei: Blob): Promise<string[][]> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await datei.arrayBuffer())
  const ws = wb.worksheets[0]
  if (!ws) return []
  const zeilen: string[][] = []
  ws.eachRow({ includeEmpty: false }, (row) => {
    const werte: string[] = []
    for (let c = 1; c <= ws.columnCount; c++) {
      const v = row.getCell(c).value
      let t = ''
      if (v === null || v === undefined) t = ''
      else if (typeof v === 'object' && 'result' in v) t = String((v as { result?: unknown }).result ?? '')
      else if (typeof v === 'object' && 'richText' in v) t = (v as { richText: { text: string }[] }).richText.map((x) => x.text).join('')
      else if (typeof v === 'object' && 'text' in v) t = String((v as { text: unknown }).text)
      else if (v instanceof Date) t = v.toISOString().slice(0, 10)
      else t = String(v)
      werte.push(t)
    }
    zeilen.push(werte)
  })
  return zeilen
}

/** Leere Excel Vorlage für den Artikelimport */
export async function artikelVorlage(): Promise<Blob> {
  const ExcelJS = await excel()
  const wb = new ExcelJS.Workbook()
  const ws = wb.addWorksheet('Artikel')
  ws.columns = [
    { header: 'Artikelnummer', width: 16 },
    { header: 'Bezeichnung', width: 32 },
    { header: 'Gebindeart', width: 14 },
    { header: 'Gebindegröße', width: 14 },
    { header: 'Stück pro Lage', width: 14 },
    { header: 'Lagen pro Palette', width: 16 },
    { header: 'Barcode', width: 18 },
    { header: 'Sollbestand', width: 12 },
  ]
  const kopf = ws.getRow(1)
  kopf.font = { bold: true, color: { argb: 'FFFFFFFF' } }
  kopf.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE } }
  ws.views = [{ state: 'frozen', ySplit: 1 }]
  const buf = await wb.xlsx.writeBuffer()
  return new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' })
}
