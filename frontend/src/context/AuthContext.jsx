import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { redirectToSignIn, resolveRole, signOut } from '../api/services/authService'

const AuthContext = createContext(null)

function displayName(profile) {
  if (!profile) return null
  const full = [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim()
  if (full) return full
  if (profile.email) return profile.email.split('@')[0]
  return 'Officer'
}

/**
 * Auth state comes from the server, not from this app.
 *
 * There is no login form. Catalyst's hosted sign-in page is the entry point
 * (client-package.json `homepage`), it establishes a session cookie, and then
 * redirects into the SPA. On boot we ask the backend who we are.
 *
 * The role in particular is NOT client-selectable — it is assigned in the
 * Catalyst console and read off the session server-side. The previous build let
 * the user pick their own role at a login screen, which in a role-gated PII
 * system means the access control was decorative.
 *
 * Four states, and the UI has to distinguish all four:
 *   'loading'    — the /auth/role round-trip is in flight
 *   'signed-in'  — session valid AND the console role maps to an SCRB role
 *   'no-role'    — session valid, but the console role is not an SCRB role
 *                  (e.g. Catalyst's built-in App User). Not recoverable in-app;
 *                  an administrator has to fix the assignment.
 *   'signed-out' — no session
 */
export function AuthProvider({ children }) {
  const [status, setStatus] = useState('loading')
  const [profile, setProfile] = useState(null)
  const [error, setError] = useState(null)

  const bootstrap = useCallback(async () => {
    setStatus('loading')
    setError(null)
    try {
      const result = await resolveRole()
      if (!result.authenticated) {
        setProfile(null)
        setStatus('signed-out')
        return
      }
      setProfile(result)
      setStatus(result.role ? 'signed-in' : 'no-role')
    } catch (err) {
      // A non-401 failure (network, 500, gateway misconfigured) is NOT the same
      // as "signed out" — reporting it as such would bounce the user to sign-in
      // in a loop while the backend is simply down. Surface it instead.
      setProfile(null)
      setError(
        err?.response?.status
          ? `Could not verify your session (HTTP ${err.response.status}).`
          : 'Could not reach the intelligence service to verify your session.',
      )
      setStatus('signed-out')
    }
  }, [])

  useEffect(() => {
    bootstrap()
  }, [bootstrap])

  // A 401 mid-session means the cookie expired. Drop state and let the login
  // screen offer a re-entry; we do not auto-redirect, because an unattended
  // redirect loop is worse than a visible prompt.
  useEffect(() => {
    const onUnauthorized = () => {
      setProfile(null)
      setStatus('signed-out')
      setError(null)
      window.dispatchEvent(new Event('scrb:logout'))
    }
    window.addEventListener('scrb:unauthorized', onUnauthorized)
    return () => window.removeEventListener('scrb:unauthorized', onUnauthorized)
  }, [])

  const logout = useCallback(() => {
    // Let session-scoped stores (InvestigationContext, ChatContext) flush first;
    // signOut() leaves the page immediately after.
    window.dispatchEvent(new Event('scrb:logout'))
    signOut()
  }, [])

  const value = useMemo(
    () => ({
      status,
      isLoading: status === 'loading',
      isAuthenticated: status === 'signed-in',
      role: profile?.role ?? null,
      catalystRole: profile?.catalystRole ?? null,
      email: profile?.email ?? null,
      userId: profile?.userId ?? null,
      // TopBar and the audit view render this. Prefer the Catalyst profile name,
      // fall back to the email's local part, then to a neutral label — never
      // blank, since it appears in exported PDF headers.
      name: displayName(profile),
      error,
      signIn: redirectToSignIn,
      retry: bootstrap,
      logout,
    }),
    [status, profile, error, bootstrap, logout],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
