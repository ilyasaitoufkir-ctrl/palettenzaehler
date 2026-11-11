import { NavLink } from 'react-router-dom'

/** Umschalter zwischen Artikelstamm und Bestandsliste */
export function StammdatenTabs() {
  return (
    <div className="mb-4 grid grid-cols-2 rounded-[14px] bg-surface-2 p-1" role="tablist">
      {[
        ['/artikel', 'Artikel'],
        ['/bestand', 'Bestand (Paletten)'],
      ].map(([to, text]) => (
        <NavLink
          key={to}
          to={to}
          role="tab"
          className={({ isActive }) =>
            `grid min-h-11 place-items-center rounded-[11px] text-sm font-semibold ${isActive ? 'bg-surface text-ink shadow-sm' : 'text-ink-2'}`
          }
        >
          {text}
        </NavLink>
      ))}
    </div>
  )
}
