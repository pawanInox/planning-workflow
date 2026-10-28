import { api } from '../lib/api'
import { Icon } from '../components/Icon'
import { ThemeToggle } from '../components/ThemeToggle'

const NOTES: Record<string, string> = {
  cancelled: 'Sign-in was cancelled. Try again whenever you are ready.',
  unavailable: 'The server cannot be reached right now, so sign-in is unavailable. Try again in a moment.',
  unconfigured:'Google sign-in is not set up on this server yet. Ask whoever runs it to set GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET and PUBLIC_URL.',
}

/** Shown on every app screen while signed out; signing in comes back to `returnTo`. */
export function SignInPage({ returnTo, authError, onHome }: { returnTo: string; authError: string | null; onHome: () => void }) {
  const note = authError ? NOTES[authError] ?? 'Sign-in failed. Please try again.' : null
  return (
    <div className="signin">
      <nav className="l-nav">
        <button className="brand" onClick={onHome}><span className="brand-mark"><Icon name="check" /></span>Yak Dai</button>
        <span className="grow" />
        <ThemeToggle />
      </nav>
      <main className="signin-card surface stagger">
        <span className="brand-mark lg"><Icon name="check" /></span>
        <h1>Sign in to Yak Dai</h1>
        <p>Your projects belong to your Google account. Anyone signed in can read a project you share by link; only you can change it.</p>
        {note && <div className="callout warn" role="alert"><Icon name="alert" /><span>{note}</span></div>}
        <a className="btn btn-primary lg" href={api.signInUrl(returnTo)}>Sign in with Google</a>
      </main>
    </div>
  )
}
