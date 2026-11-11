import { useEffect, useId, useRef, type ReactNode } from 'react'
import { Loader2, Minus, Plus, X } from 'lucide-react'
import type { PositionsKonfidenz } from '../types'

export function Spinner({ className = 'size-5' }: { className?: string }) {
  return <Loader2 className={`drehen ${className}`} aria-hidden />
}

const KONF: Record<PositionsKonfidenz, { text: string; cls: string }> = {
  hoch: { text: 'Hoch', cls: 'bg-ok-soft text-ok' },
  mittel: { text: 'Mittel', cls: 'bg-warn-soft text-warn' },
  niedrig: { text: 'Niedrig', cls: 'bg-bad-soft text-bad' },
  manuell: { text: 'Manuell', cls: 'bg-surface-2 text-ink-2' },
}

export function KonfidenzBadge({ wert, mitLabel = false }: { wert: PositionsKonfidenz; mitLabel?: boolean }) {
  const k = KONF[wert]
  return (
    <span className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${k.cls}`}>
      <span className="size-1.5 rounded-full bg-current" aria-hidden />
      {mitLabel && wert !== 'manuell' ? 'KI Konfidenz ' : ''}
      {k.text}
    </span>
  )
}

export function Leer({ icon, titel, text, aktion }: { icon: ReactNode; titel: string; text: string; aktion?: ReactNode }) {
  return (
    <div className="card flex flex-col items-center gap-3 px-6 py-10 text-center">
      <div className="grid size-14 place-items-center rounded-2xl bg-[linear-gradient(180deg,var(--c-accent-soft),var(--c-surface-2))] text-accent ring-1 ring-line">{icon}</div>
      <div>
        <p className="font-semibold">{titel}</p>
        <p className="mt-1 text-sm text-ink-2">{text}</p>
      </div>
      {aktion}
    </div>
  )
}

export function Seitenkopf({ titel, unter, aktion }: { titel: string; unter?: ReactNode; aktion?: ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-3">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] leading-tight font-bold tracking-tight">{titel}</h1>
        {unter && <div className="mt-1 text-sm text-ink-2">{unter}</div>}
      </div>
      {aktion}
    </div>
  )
}

/** Große Zahleneingabe mit Plus/Minus, mit Handschuhen bedienbar */
export function ZahlFeld({
  label,
  wert,
  onChange,
  hinweis,
  ungueltig,
}: {
  label: string
  wert: string
  onChange: (v: string) => void
  hinweis?: string
  ungueltig?: boolean
}) {
  const id = useId()
  const n = Number(wert.replace(',', '.'))
  const schritt = (d: number) => {
    const basis = wert.trim() === '' || Number.isNaN(n) ? 0 : n
    onChange(String(Math.max(0, Math.round(basis + d))))
  }
  return (
    <div className="min-w-0">
      <label htmlFor={id} className="label">
        {label}
      </label>
      <div className={`flex items-stretch overflow-hidden rounded-[14px] border bg-surface ${ungueltig ? 'border-bad' : 'border-line'}`}>
        <button type="button" className="grid w-14 shrink-0 place-items-center text-ink-2 active:bg-surface-2" onClick={() => schritt(-1)} aria-label={`${label} verringern`}>
          <Minus className="size-5" />
        </button>
        <input
          id={id}
          inputMode="numeric"
          pattern="[0-9]*"
          className="tabular min-h-[56px] w-full min-w-0 bg-transparent text-center text-xl font-semibold outline-none"
          value={wert}
          onChange={(e) => onChange(e.target.value.replace(/[^\d,.-]/g, ''))}
          placeholder="?"
          aria-invalid={ungueltig || undefined}
        />
        <button type="button" className="grid w-14 shrink-0 place-items-center text-ink-2 active:bg-surface-2" onClick={() => schritt(1)} aria-label={`${label} erhöhen`}>
          <Plus className="size-5" />
        </button>
      </div>
      {hinweis && <p className="mt-1 text-xs text-ink-3">{hinweis}</p>}
    </div>
  )
}

/** Bottom Sheet für Formulare und Auswahl */
export function Sheet({ offen, onClose, titel, children }: { offen: boolean; onClose: () => void; titel: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!offen) return
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', esc)
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    return () => {
      window.removeEventListener('keydown', esc)
      document.body.style.overflow = ''
    }
  }, [offen, onClose])
  if (!offen) return null
  return (
    <div className="fixed inset-0 z-40 flex items-end justify-center sm:items-center" role="dialog" aria-modal="true" aria-label={titel}>
      <button className="absolute inset-0 bg-black/35" aria-label="Schließen" onClick={onClose} />
      <div
        ref={ref}
        tabIndex={-1}
        className="einblenden relative flex max-h-[92dvh] w-full max-w-lg flex-col rounded-t-[24px] bg-bg outline-none sm:rounded-[24px]"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
          <h2 className="text-lg font-semibold">{titel}</h2>
          <button className="btn btn-ghost btn-icon -mr-3" onClick={onClose} aria-label="Schließen">
            <X className="size-5" />
          </button>
        </div>
        <div className="overflow-y-auto px-5 py-4">{children}</div>
      </div>
    </div>
  )
}

/** Bestätigungsdialog (ersetzt window.confirm) */
export function Bestaetigen({
  offen,
  titel,
  text,
  ja,
  onJa,
  onNein,
  gefaehrlich,
}: {
  offen: boolean
  titel: string
  text: string
  ja: string
  onJa: () => void
  onNein: () => void
  gefaehrlich?: boolean
}) {
  return (
    <Sheet offen={offen} onClose={onNein} titel={titel}>
      <p className="text-ink-2">{text}</p>
      <div className="mt-5 grid grid-cols-2 gap-3">
        <button className="btn btn-secondary" onClick={onNein}>
          Abbrechen
        </button>
        <button className={`btn ${gefaehrlich ? 'btn-danger' : 'btn-primary'}`} onClick={onJa}>
          {ja}
        </button>
      </div>
    </Sheet>
  )
}

export function Kennzahl({ wert, label, ton }: { wert: ReactNode; label: string; ton?: 'bad' | 'accent' }) {
  return (
    <div className="card min-w-0 px-4 py-4">
      <div className={`tabular text-[1.75rem] leading-none font-semibold tracking-tight ${ton === 'bad' ? 'text-bad' : ton === 'accent' ? 'text-accent' : ''}`}>{wert}</div>
      <div className="mt-2 text-xs font-medium text-ink-2">{label}</div>
    </div>
  )
}
