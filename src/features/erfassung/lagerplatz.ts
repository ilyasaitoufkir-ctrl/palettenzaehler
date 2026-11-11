import { useCallback, useState } from 'react'

/**
 * Aktiver Lagerplatz: wird gescannt oder eingegeben und bleibt auf dem Gerät gesetzt,
 * bis er geändert wird. Jede danach fotografierte Palette bekommt diesen Platz.
 */
const KEY = 'pz-lagerplatz-aktiv'

export function ladeLagerplatz(): string {
  try {
    return localStorage.getItem(KEY) ?? ''
  } catch {
    return ''
  }
}

function speichereLagerplatz(p: string) {
  try {
    localStorage.setItem(KEY, p)
  } catch {
    // Speicher nicht verfügbar: der Platz gilt dann nur für diese Sitzung
  }
}

export function useAktiverLagerplatz(): [string, (p: string) => void] {
  const [platz, setPlatz] = useState(ladeLagerplatz)
  const setzen = useCallback((p: string) => {
    const kurz = p.slice(0, 40)
    speichereLagerplatz(kurz)
    setPlatz(kurz)
  }, [])
  return [platz, setzen]
}

/**
 * Wählt aus gescannten Codes den Lagerplatz. Bevorzugt ein Code, der im Bestand als Lagerplatz vorkommt.
 */
export function platzAusWerten(werte: string[], bekannt: Set<string>): string {
  const saubere = werte.map((w) => w.trim()).filter(Boolean)
  return saubere.find((w) => bekannt.has(w.toLowerCase())) ?? saubere[0] ?? ''
}
