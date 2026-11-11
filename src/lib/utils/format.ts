export function zeitRelativ(ms: number, jetzt = Date.now()): string {
  const s = Math.round((jetzt - ms) / 1000)
  if (s < 60) return 'gerade eben'
  const m = Math.round(s / 60)
  if (m < 60) return `vor ${m} Min.`
  const h = Math.round(m / 60)
  if (h < 24) return `vor ${h} Std.`
  return new Date(ms).toLocaleDateString('de-DE')
}

export function heuteIso(): string {
  const d = new Date()
  const p = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

export function dateinameSicher(s: string): string {
  return s.normalize('NFKD').replace(/[^\w-]+/g, '_').replace(/_+/g, '_').slice(0, 60) || 'inventur'
}
