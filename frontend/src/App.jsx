import { lazy, Suspense } from 'react'
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom'
import { AuthProvider, useAuth } from './context/AuthContext'
import { SessionProvider } from './context/SessionContext'
import { InvestigationProvider } from './context/InvestigationContext'
import { ChatProvider } from './context/ChatContext'
import AppShell from './components/layout/AppShell'
import RequireRole from './components/common/RequireRole'
import ErrorBoundary from './components/common/ErrorBoundary'
import GlobalToast from './components/common/GlobalToast'
import { useInvestigation } from './context/InvestigationContext'
import LoginPage from './pages/LoginPage'
import ChatPage from './pages/ChatPage'
// Lazy-loaded so their heavy deps (Leaflet for the map, Cytoscape for the graph)
// are code-split out of the entry chunk and fetched only when the route is
// visited. RightPanel (chat home) loads them the same way — see ChatPage.jsx.
const MapPage = lazy(() => import('./pages/MapPage'))
const NetworkGraphPage = lazy(() => import('./pages/NetworkGraphPage'))
import AlertsPage from './pages/AlertsPage'
import ProfilePage from './pages/ProfilePage'
import CaseDetailPage from './pages/CaseDetailPage'
import AuditPage from './pages/AuditPage'

// ---------------------------------------------------------------------------
// Added vs. Existing (see FEATURES.md for the full table with spec section
// references):
//   Existing (reproduced from the prior build spec): chat, sidebar, header,
//     alerts, profile, map, network graph, PDF export.
//   Added: Kannada/English toggle, voice playback on bot messages, login/role
//     selection, role-gated sidebar & routes, Investigator Decision Support
//     (/case/:caseId), Analyst Forecast panel, reasoning-path trace viewer,
//     audit log view, threshold editing, PII masking by role.
// ---------------------------------------------------------------------------

function RequireAuth({ children }) {
  const { isAuthenticated, isLoading } = useAuth()
  // The session check is a round-trip to /auth/role. Without this branch the
  // first render is always unauthenticated, so every load flashed the login
  // screen and lost the user's deep link before the answer came back.
  if (isLoading) return <RouteFallback />
  if (!isAuthenticated) return <Navigate to="/login" replace />
  return children
}

// /case with no id resolves to the chat's active case (§4). Falls back to the
// chat if the investigation stack has no case yet.
function CaseIndexRedirect() {
  const { activeCaseId } = useInvestigation()
  if (activeCaseId) return <Navigate to={`/case/${encodeURIComponent(activeCaseId)}`} replace />
  return <Navigate to="/" replace />
}

// Fallback shown while a lazily-loaded route chunk is fetching.
function RouteFallback() {
  return <div className="route-fallback">Loading…</div>
}

// Keeps an already-signed-in user off the status screen — otherwise a stale
// /#/login bookmark would strand them there with no way forward.
function LoginRoute() {
  const { isAuthenticated } = useAuth()
  if (isAuthenticated) return <Navigate to="/" replace />
  return <LoginPage />
}

function AppRoutes() {
  return (
    <Suspense fallback={<RouteFallback />}>
    <Routes>
      {/* Not a credential form — a session-status screen. Catalyst's hosted
          sign-in is the real entry point; this covers "verifying", "no SCRB role
          assigned", and "session expired". */}
      <Route path="/login" element={<LoginRoute />} />
      <Route
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      >
        <Route path="/" element={<ChatPage />} />
        <Route path="/map" element={<RequireRole feature="map"><MapPage /></RequireRole>} />
        <Route path="/network" element={<RequireRole feature="network"><NetworkGraphPage /></RequireRole>} />
        <Route path="/alerts" element={<RequireRole feature="alerts"><AlertsPage /></RequireRole>} />
        <Route path="/profile" element={<RequireRole feature="profile"><ProfilePage /></RequireRole>} />
        <Route path="/case" element={<RequireRole feature="case-detail"><CaseIndexRedirect /></RequireRole>} />
        <Route path="/case/:caseId" element={<RequireRole feature="case-detail"><CaseDetailPage /></RequireRole>} />
        <Route path="/audit" element={<RequireRole feature="audit-own"><AuditPage /></RequireRole>} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Route>
    </Routes>
    </Suspense>
  )
}

export default function App() {
  // HashRouter (not BrowserRouter): the app is served as static files from
  // Catalyst Web Client Hosting under a subpath, so hash routes guarantee deep
  // links / hard refreshes resolve without server-side rewrite rules.
  return (
    <HashRouter>
      <AuthProvider>
        <SessionProvider>
          <InvestigationProvider>
            <ChatProvider>
              {/* Inside the providers, not outside: a crashed view must not take
                  the session and chat state down with it, and "Try again" then
                  re-renders the route without a full reload. */}
              <ErrorBoundary>
                <AppRoutes />
              </ErrorBoundary>
              <GlobalToast />
            </ChatProvider>
          </InvestigationProvider>
        </SessionProvider>
      </AuthProvider>
    </HashRouter>
  )
}
