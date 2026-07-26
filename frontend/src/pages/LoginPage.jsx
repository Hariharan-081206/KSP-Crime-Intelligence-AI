import { Landmark, Search, BarChart3, Shield, Lock, AlertTriangle, LogIn } from 'lucide-react'
import { useAuth } from '../context/AuthContext'
import { ROLE_LABELS, ROLES } from '../utils/roles'
import './LoginPage.css'

// Reference only — these describe what each role can see once an administrator
// has assigned it. They are NOT selectable: the role comes from the Catalyst
// console and is read off the session server-side. The previous build let the
// user choose here, which made the role gates decorative.
const ROLE_INFO = [
  {
    role: ROLES.POLICYMAKER,
    icon: Landmark,
    description: 'Aggregate crime trends, district comparisons and policy-level dashboards.',
  },
  {
    role: ROLES.INVESTIGATOR,
    icon: Search,
    description: 'Case lookup, criminal network mapping and behavioral analysis.',
  },
  {
    role: ROLES.ANALYST,
    icon: BarChart3,
    description: 'Forecasting, threshold tuning and behavioral pattern analysis.',
  },
]

/**
 * Not a login form — Zoho/Catalyst owns authentication.
 *
 * Catalyst's hosted sign-in page is the application entry point
 * (client-package.json `homepage`); by the time the SPA loads, a session either
 * exists or it does not. This screen only renders the states where the SPA
 * cannot proceed, and gives the user the one action that helps in each.
 */
export default function LoginPage() {
  const { status, isLoading, catalystRole, email, error, signIn, retry } = useAuth()

  if (isLoading) {
    return (
      <Shell>
        <div className="login-status">
          <span className="login-spinner" aria-hidden="true" />
          <p>Verifying your Zoho session…</p>
        </div>
      </Shell>
    )
  }

  // Signed in, but the Catalyst role is not one of the three SCRB roles. Nothing
  // the user can do about it in-app — say exactly what an administrator must fix.
  if (status === 'no-role') {
    return (
      <Shell>
        <div className="login-status login-status-warn">
          <AlertTriangle size={22} />
          <h2>No SCRB role assigned</h2>
          <p>
            You are signed in{email ? ` as ${email}` : ''}, but your Catalyst role
            {catalystRole ? ` (${catalystRole})` : ''} does not grant access to this portal.
          </p>
          <p className="login-status-hint">
            An administrator must assign one of <strong>Policymaker</strong>,{' '}
            <strong>Investigator</strong> or <strong>Analyst</strong> in the Catalyst console under
            Authentication → Manage Application Users → Roles, then reload this page.
          </p>
          <button className="login-submit" type="button" onClick={retry}>
            Check again
          </button>
        </div>
      </Shell>
    )
  }

  return (
    <Shell>
      <div className="login-status">
        <Lock size={22} />
        <h2>Sign in required</h2>
        <p>{error ?? 'Your session has ended or has not started yet.'}</p>
        <button className="login-submit" type="button" onClick={signIn}>
          <LogIn size={14} />
          Sign in with Zoho
        </button>
        {error && (
          <button className="login-secondary" type="button" onClick={retry}>
            Retry without signing in
          </button>
        )}
      </div>

      <div className="login-role-grid login-role-grid-readonly">
        {ROLE_INFO.map(({ role, icon: Icon, description }) => (
          <div key={role} className="login-role-btn login-role-btn-readonly">
            <div className="login-role-icon">
              <Icon size={20} />
            </div>
            <div className="login-role-text">
              <span className="login-role-name">{ROLE_LABELS[role]}</span>
              <span className="login-role-desc">{description}</span>
            </div>
          </div>
        ))}
      </div>
      <p className="login-hint">
        Access is determined by the role your administrator assigned in Catalyst — it cannot be
        selected here.
      </p>
    </Shell>
  )
}

function Shell({ children }) {
  return (
    <div className="login-page">
      <header className="login-topbar">
        <Shield size={18} color="var(--color-maroon)" />
        <span>SCRB Crime Intelligence</span>
      </header>
      <div className="login-body">
        <div className="login-card">
          <div className="login-card-heading">
            <div>
              <h1>SCRB Crime Intelligence Portal</h1>
              <p>Karnataka State Crime Records Bureau</p>
            </div>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
