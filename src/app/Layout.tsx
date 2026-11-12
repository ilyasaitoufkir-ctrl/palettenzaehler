import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Boxes, Camera, ClipboardList, LayoutGrid, LogOut, Monitor, Moon, Package, Sun, WifiOff } from 'lucide-react'
import { useApp } from './AppContext'
import { useTheme } from '../hooks/useTheme'

const NAV = [
  { to: '/', label: 'Übersicht', icon: LayoutGrid, end: true },
  { to: '/liste', label: 'Liste', icon: ClipboardList },
  { to: '/erfassen', label: 'Erfassen', icon: Camera, haupt: true },
  { to: '/artikel', label: 'Artikel', icon: Package },
  { to: '/inventuren', label: 'Inventuren', icon: Boxes },
]

export function Layout() {
  const { repo, online, nutzer, aktiveInventur, warteschlange } = useApp()
  const { thema, weiter } = useTheme()
  const navigate = useNavigate()
  const { pathname } = useLocation()
  const offen = warteschlange.filter((w) => w.status === 'bereit').length
  const ThemaIcon = thema === 'dark' ? Moon : thema === 'light' ? Sun : Monitor

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col">
      <header
        className="no-print sticky z-30 border-b border-line bg-bg/90 backdrop-blur"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-accent-ink">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[0.9375rem] leading-tight font-semibold">Palettenzähler</div>
            <div className="truncate text-xs text-ink-2">{aktiveInventur ? aktiveInventur.name : 'Keine aktive Inventur'}</div>
          </div>
          {!online && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
              <WifiOff className="size-3.5" /> Offline
            </span>
          )}
          <button className="btn btn-ghost btn-icon" onClick={weiter} aria-label={`Darstellung: ${thema === 'system' ? 'System' : thema === 'dark' ? 'Dunkel' : 'Hell'}`}>
            <ThemaIcon className="size-5" />
          </button>
          {repo.art !== 'artifact' && <button
            className="btn btn-ghost btn-icon -mr-2"
            onClick={async () => {
              await repo.logout()
              navigate('/login')
            }}
            aria-label={`Abmelden (${nutzer?.email ?? ''})`}
            title={nutzer?.email}
          >
            <LogOut className="size-5" />
          </button>}
        </div>
      </header>

      <main
        className="flex-1 pt-5"
        style={{
          paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
          paddingBottom: 'calc(112px + env(safe-area-inset-bottom, 0px))',
        }}
      >
        <Outlet />
      </main>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 px-3"
        style={{ paddingBottom: 'calc(env(safe-area-inset-bottom, 0px) + 10px)' }}
        aria-label="Hauptnavigation"
      >
        <div className="mx-auto grid max-w-xl grid-cols-5 items-end rounded-[26px] border border-line bg-surface/80 px-1.5 pb-1.5 shadow-[0_18px_40px_-16px_rgb(var(--c-shadow)/0.35)] backdrop-blur-xl">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive: aktiv }) => {
                const isActive = aktiv || (n.to === '/artikel' && pathname === '/bestand')
                return `relative flex min-h-[62px] flex-col items-center justify-center gap-0.5 text-[0.6875rem] font-semibold ${
                  isActive ? 'text-accent' : 'text-ink-3'
                }`
              }}
            >
              {({ isActive: aktiv }) => {
                const isActive = aktiv || (n.to === '/artikel' && pathname === '/bestand')
                return n.haupt ? (
                  <>
                    <span className="-mt-7 grid size-[62px] place-items-center rounded-full bg-[linear-gradient(180deg,#ff9a2e,var(--c-brand)_60%,#e46f00)] text-accent-ink shadow-[0_14px_26px_-10px_rgb(239_125_0/0.8),inset_0_1px_0_rgb(255_255_255/0.35)] ring-[5px] ring-bg">
                      <n.icon className="size-7" />
                    </span>
                    <span className={isActive ? 'text-accent' : 'text-ink-2'}>{n.label}</span>
                    {offen > 0 && (
                      <span className="absolute top-0 right-3 grid min-w-5 place-items-center rounded-full bg-bad px-1 text-[0.6875rem] text-white">{offen}</span>
                    )}
                  </>
                ) : (
                  <>
                    <span className={`grid h-8 w-14 place-items-center rounded-2xl transition-colors ${isActive ? 'bg-accent-soft' : ''}`}>
                      <n.icon className="size-[22px]" strokeWidth={isActive ? 2.3 : 1.9} />
                    </span>
                    {n.label}
                  </>
                )
              }}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
