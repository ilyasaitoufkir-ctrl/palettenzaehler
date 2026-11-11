import type { Artikel, BestandsPalette, KiErgebnis } from '../../types'
import { nachschlagen } from '../../lib/utils/zuordnung'
import type { PositionStart } from './PositionForm'

/**
 * Baut die Vorbelegung einer Position aus allem, was bekannt ist:
 * gescannte Barcodes, von der KI abgelesene Nummern, Bestandsliste und Artikelstamm.
 * Die Bestandsliste hat Vorrang, weil sie aus dem ERP kommt.
 */
export function startwerte(nummern: string[], ki: KiErgebnis | null, bestand: BestandsPalette[], artikel: Artikel[], platzAktiv = ''): PositionStart {
  const alle = [...nummern, ...(ki?.barcode_nummern ?? []), ki?.paletten_nummer ?? '', ki?.artikel_match ?? ''].filter(Boolean)
  const z = nachschlagen(alle, bestand, artikel)
  const a = z.artikel ?? (ki?.artikel_match ? (artikel.find((x) => x.artikelnummer === ki.artikel_match) ?? null) : null)
  const spl = ki?.stueck_pro_lage ?? a?.stueckProLage ?? null
  let lagen = ki?.lagen ?? null
  // nur gescannt, ohne KI: Lagen aus Bestand und Stück pro Lage ableiten, wenn es glatt aufgeht
  if (!ki && z.palette?.menge != null && spl && z.palette.menge % spl === 0) lagen = z.palette.menge / spl
  return {
    artikelId: a?.id ?? null,
    artikelnummer: a?.artikelnummer ?? z.palette?.artikelnummer ?? '',
    bezeichnung: a ? a.bezeichnung : z.palette?.bezeichnung || ki?.produkt || '',
    gebindeart: ki?.gebindeart ?? (a ? [a.gebindeart, a.gebindegroesse].filter(Boolean).join(' ') : ''),
    lagen,
    stueckProLage: spl,
    fehlend: ki?.fehlende_stueck ?? 0,
    // der tatsächlich gescannte oder aktive Platz hat Vorrang, der Bestand dient als Vergleich
    lagerplatz: platzAktiv.trim() || z.palette?.lagerplatz || '',
    lagerplatzLaut: z.palette?.lagerplatz ?? '',
    palettenNummer: z.palettenNummer ?? ki?.paletten_nummer ?? '',
    charge: z.charge ?? ki?.charge ?? '',
    sollMenge: z.palette?.menge ?? null,
    zuordnung: z.grund,
  }
}
