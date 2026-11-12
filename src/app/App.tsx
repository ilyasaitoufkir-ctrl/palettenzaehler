import { BerichtPage } from '../features/bericht/BerichtPage'
import type { ReactNode } from 'react'
import { BrowserRouter, MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom'
import { AppProvider, useApp } from './AppContext'
import { Layout } from './Layout'
import { Spinner } from '../components/ui'
import { GesperrtPage, LoginPage } from '../features/auth/LoginPage'
import { DashboardPage } from '../features/dashboard/DashboardPage'
import { InventurenPage } from '../features/inventur/InventurenPage'
import { ListePage } from '../features/inventur/ListePage'
import { ArtikelPage } from '../features/artikel/ArtikelPage'
import { BestandPage } from '../features/artikel/BestandPage'
import { ErfassenPage } from '../features/erfassung/ErfassenPage'
import { BestaetigenPage } from '../features/erfassung/BestaetigenPage'
import { ManuellPage, PositionBearbeitenPage } from '../features/erfassung/ManuellPage'

function Laden() {
  return (
    <div className="grid min-h-dvh place-items-center text-accent">
      <Spinner className="size-8" />
    </div>
  )
}

function Geschuetzt({ children }: { children: ReactNode }) {
  const { auth } = useApp()
  const ort = useLocation()
  if (auth.status === 'laden') return <Laden />
  if (auth.status === 'gesperrt') return <GesperrtPage />
  if (auth.status === 'abgemeldet') return <Navigate to="/login" replace state={{ von: ort.pathname }} />
  return <>{children}</>
}

function Routen() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <Geschuetzt>
            <Layout />
          </Geschuetzt>
        }
      >
        <Route index element={<DashboardPage />} />
        <Route path="/inventuren" element={<InventurenPage />} />
        <Route path="/liste" element={<ListePage />} />
        <Route path="/artikel" element={<ArtikelPage />} />
        <Route path="/bestand" element={<BestandPage />} />
        <Route path="/erfassen" element={<ErfassenPage />} />
        <Route path="/erfassen/:id" element={<BestaetigenPage />} />
        <Route path="/manuell" element={<ManuellPage />} />
        <Route path="/position/:id" element={<PositionBearbeitenPage />} />
        <Route path="/bericht" element={<BerichtPage />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  )
}

/** Für eingebettete Vorschauen ohne eigene URL Steuerung (VITE_ROUTER=memory) */
const Router = import.meta.env.VITE_ROUTER === 'memory' ? MemoryRouter : BrowserRouter

export function App() {
  return (
    <Router>
      <AppProvider fallback={<Laden />}>
        <Routen />
      </AppProvider>
    </Router>
  )
}
