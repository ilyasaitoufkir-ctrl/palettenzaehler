/** Zufällige, URL sichere ID (dient auch als Idempotenzschlüssel für Positionen) */
export function neueId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID().replace(/-/g, '').slice(0, 20)
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 12)
}
