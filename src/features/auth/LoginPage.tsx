import { useState, type FormEvent } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { Boxes, LogIn } from 'lucide-react'
import { useApp } from '../../app/AppContext'
import { Spinner } from '../../components/ui'

function meldung(code: string | undefined): string {
  switch (code) {
    case 'auth/invalid-email':
      return 'Die E-Mail Adresse ist ungültig.'
    case 'auth/missing-password':
      return 'Bitte Passwort bzw. Zugangscode eingeben.'
    case 'auth/missing-name':
      return 'Bitte deinen Namen eingeben.'
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return 'E-Mail oder Passwort ist falsch.'
    case 'auth/too-many-requests':
      return 'Zu viele Versuche. Bitte kurz warten.'
    case 'auth/network-request-failed':
      return 'Keine Verbindung. Für die erste Anmeldung wird Internet benötigt.'
    default:
      return 'Anmeldung fehlgeschlagen.'
  }
}

export function LoginPage() {
  const { repo, auth } = useApp()
  const ort = useLocation()
  const lokal = repo.art === 'lokal'
  const [email, setEmail] = useState('')
  const [passwort, setPasswort] = useState('')
  const [laeuft, setLaeuft] = useState(false)
  const [fehler, setFehler] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  if (auth.status === 'angemeldet') {
    const ziel = (ort.state as { von?: string } | null)?.von ?? '/'
    return <Navigate to={ziel} replace />
  }

  const absenden = async (e: FormEvent) => {
    e.preventDefault()
    setFehler(null)
    setInfo(null)
    setLaeuft(true)
    try {
      await repo.login(email, passwort)
    } catch (err) {
      setFehler(meldung((err as { code?: string }).code))
    } finally {
      setLaeuft(false)
    }
  }

  const zuruecksetzen = async () => {
    setFehler(null)
    if (!email.includes('@')) return setFehler('Bitte zuerst deine E-Mail Adresse eintragen.')
    try {
      await repo.passwortZuruecksetzen(email)
      setInfo('Falls ein Konto existiert, wurde eine E-Mail zum Zurücksetzen verschickt.')
    } catch (err) {
      setFehler(meldung((err as { code?: string }).code))
    }
  }

  return (
    <div
      className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center gap-6 py-8"
      style={{ paddingLeft: 'max(20px, env(safe-area-inset-left, 0px))', paddingRight: 'max(20px, env(safe-area-inset-right, 0px))' }}
    >
      <div className="relative overflow-hidden rounded-[28px] bg-[linear-gradient(160deg,#ffae4d_0%,var(--c-brand)_45%,#d96400_100%)] px-6 pt-8 pb-7 text-white shadow-[0_24px_48px_-20px_rgb(239_125_0/0.7),inset_0_1px_0_rgb(255_255_255/0.35)]">
        <div className="pointer-events-none absolute -top-16 -right-12 size-56 rounded-full bg-white/15 blur-2xl" aria-hidden />
        <div className="relative grid size-14 place-items-center rounded-2xl bg-white/20 ring-1 ring-white/30 backdrop-blur">
          <Boxes className="size-7" />
        </div>
        <p className="relative mt-6 text-[0.6875rem] font-semibold tracking-[0.14em] uppercase text-white/80">Lager Inventur</p>
        <h1 className="relative mt-1 text-[1.875rem] leading-tight font-semibold tracking-tight">Gebäude 5 Inventurunterstützung</h1>
        <p className="relative mt-2 text-sm leading-relaxed text-white/85">Paletten fotografieren, Menge prüfen, Inventur fertig.</p>
      </div>

      {lokal && (
        <div className="-mt-2 rounded-[14px] bg-surface-2 px-4 py-3 text-sm text-ink-2">
          Melde dich mit deinem Namen und dem Zugangscode an. Die Inventurdaten werden auf diesem Gerät gespeichert.
        </div>
      )}

      <form onSubmit={absenden} className="card-raised flex flex-col gap-4 p-5" noValidate>
        <div>
          <label className="label" htmlFor="login-email">
            {lokal ? 'Name' : 'E-Mail'}
          </label>
          <input id="login-email" className="field" type={lokal ? 'text' : 'email'} autoComplete="username" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        <div>
          <label className="label" htmlFor="login-pw">
            {lokal ? 'Zugangscode' : 'Passwort'}
          </label>
          <input
            id="login-pw"
            className="field"
            type="password"
            autoComplete="current-password"
            value={passwort}
            onChange={(e) => setPasswort(e.target.value)}
            required
          />
        </div>
        {fehler && (
          <p className="rounded-[14px] bg-bad-soft px-4 py-3 text-sm text-bad" role="alert">
            {fehler}
          </p>
        )}
        {info && <p className="rounded-[14px] bg-ok-soft px-4 py-3 text-sm text-ok">{info}</p>}
        <button className="btn btn-primary btn-lg mt-2" disabled={laeuft}>
          {laeuft ? <Spinner /> : <LogIn className="size-5" />}
          Anmelden
        </button>
        {!lokal && (
          <button type="button" className="btn btn-ghost" onClick={zuruecksetzen}>
            Passwort vergessen
          </button>
        )}
      </form>
      {!lokal && <p className="text-center text-xs text-ink-3">Konten werden von der Administration angelegt und freigeschaltet.</p>}
    </div>
  )
}

export function GesperrtPage() {
  const { repo, auth } = useApp()
  if (repo.art === 'artifact') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
        <h1 className="text-2xl font-bold">Kein Zugriff auf die Inventurdaten</h1>
        <p className="text-ink-2">
          Die App speichert die Inventur gemeinsam für alle, mit denen die Seite geteilt ist. Dafür musst du in Claude angemeldet sein und die
          Seite muss mit dir geteilt sein. Öffne den Link bitte in Claude und frag sonst die Person, die ihn dir geschickt hat.
        </p>
      </div>
    )
  }
  return (
    <div className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-5">
      <h1 className="text-2xl font-bold">Konto noch nicht freigeschaltet</h1>
      <p className="text-ink-2">
        Du bist als {auth.status === 'gesperrt' ? auth.email : ''} angemeldet, hast aber noch keinen Zugriff auf Inventurdaten. Bitte die Administration, dein
        Konto freizuschalten.
      </p>
      <button className="btn btn-secondary" onClick={() => repo.logout()}>
        Abmelden
      </button>
    </div>
  )
}
