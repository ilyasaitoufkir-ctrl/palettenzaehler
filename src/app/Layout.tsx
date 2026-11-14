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
    <div className="mx-auto flex min-h-dvh w-full max-w-xl flex-col lg:max-w-none">
      {/* Seitenleiste ab 1024 px Breite, ersetzt Kopfzeile und untere Leiste */}
      <aside
        className="no-print fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-line bg-surface/85 px-4 pb-6 backdrop-blur-xl lg:flex"
        style={{ paddingTop: 'max(24px, env(safe-area-inset-top, 0px))' }}
      >
        <div className="flex items-center gap-3 px-2">
          <div className="grid size-10 shrink-0 place-items-center rounded-xl bg-brand text-accent-ink">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0">
            <div className="text-base leading-tight font-bold tracking-tight">Gebäude 5 Inventurunterstützung</div>
            <div className="truncate text-xs text-ink-2">{aktiveInventur ? aktiveInventur.name : 'Keine aktive Inventur'}</div>
          </div>
        </div>

        <nav className="mt-8 flex flex-col gap-1" aria-label="Hauptnavigation am Computer">
          {NAV.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.end}
              className={({ isActive: aktiv }) => {
                const isActive = aktiv || (n.to === '/artikel' && pathname === '/bestand')
                return `flex items-center gap-3 rounded-[14px] px-3 py-2.5 text-sm font-semibold transition-colors ${
                  isActive ? 'bg-accent-soft text-accent' : 'text-ink-2 hover:bg-surface-2 hover:text-ink'
                }`
              }}
            >
              <n.icon className="size-5 shrink-0" strokeWidth={1.9} />
              <span className="flex-1">{n.label}</span>
              {n.haupt && offen > 0 && <span className="grid min-w-5 place-items-center rounded-full bg-bad px-1.5 text-[0.6875rem] text-white">{offen}</span>}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex flex-col gap-2 border-t border-line pt-4">
          {!online && (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-warn-soft px-2.5 py-1 text-xs font-semibold text-warn">
              <WifiOff className="size-3.5" /> Offline
            </span>
          )}
          <button className="btn btn-ghost justify-start" onClick={weiter}>
            <ThemaIcon className="size-5" /> Darstellung: {thema === 'system' ? 'System' : thema === 'dark' ? 'Dunkel' : 'Hell'}
          </button>
          {repo.art !== 'artifact' && (
            <button
              className="btn btn-ghost justify-start"
              onClick={async () => {
                await repo.logout()
                navigate('/login')
              }}
              title={nutzer?.email}
            >
              <LogOut className="size-5" /> Abmelden
            </button>
          )}
          {nutzer?.email && <p className="truncate px-2 text-xs text-ink-3">{nutzer.email}</p>}
        </div>
      </aside>
      <header
        className="no-print sticky z-30 lg:hidden border-b border-line bg-bg/90 backdrop-blur"
        style={{ top: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-4 py-2.5">
          <div className="grid size-9 shrink-0 place-items-center rounded-xl bg-brand text-accent-ink">
            <Boxes className="size-5" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="truncate text-[1.0625rem] leading-tight font-bold tracking-tight">Gebäude 5 Inventurunterstützung</div>
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
        className="flex-1 pt-5 pb-[calc(112px+env(safe-area-inset-bottom,0px))] lg:ml-64 lg:pt-10 lg:pb-12"
        style={{
          paddingLeft: 'max(16px, env(safe-area-inset-left, 0px))',
          paddingRight: 'max(16px, env(safe-area-inset-right, 0px))',
        }}
      >
        <div className="lg:mx-auto lg:max-w-6xl lg:px-6">
          <Outlet />
        </div>
      </main>

      <nav
        className="no-print fixed inset-x-0 bottom-0 z-30 px-3 lg:hidden"
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
