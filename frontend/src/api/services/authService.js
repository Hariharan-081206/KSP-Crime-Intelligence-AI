import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'
import { normalizeRole } from '../../utils/roles'

// No token plumbing here any more. Catalyst Authentication is cookie-based: the
// session lives in ZD_CSRF_TOKEN plus the Zoho IAM cookies, the SPA is served
// same-origin with the API (/app/* and /api/* on one project domain), so the
// browser attaches them to every request automatically. The old
// applySessionToken/ROLE_TOKENS dev-header scheme was never read by the backend.

/**
 * Who is the caller, according to the server?
 *
 * The ONLY source of role truth. Roles are assigned in the Catalyst console
 * (Authentication → Manage Application Users → Roles) and the backend reads them
 * off the session — the client cannot choose or influence its own role.
 *
 * @returns {Promise<{
 *   authenticated: boolean,
 *   role: string|null,
 *   catalystRole: string|null,
 *   userId: string|null,
 *   email: string|null,
 *   firstName: string|null,
 *   lastName: string|null
 * }>}
 *
 * Three distinct outcomes the caller must tell apart:
 *   authenticated + role         → normal operation
 *   authenticated + role null    → signed in, but the console role is not an
 *                                  SCRB role (e.g. Catalyst's built-in App User)
 *   not authenticated (401)      → no session; send the user to sign in
 */
export async function resolveRole() {
  try {
    const { data } = await apiClient.get(ENDPOINTS.authRole)
    return {
      authenticated: true,
      // Backend sends the console's capitalisation; the app keys off lowercase.
      role: normalizeRole(data?.role),
      catalystRole: data?.catalystRole ?? data?.role ?? null,
      userId: data?.user_id ?? null,
      email: data?.email ?? null,
      firstName: data?.firstName ?? null,
      lastName: data?.lastName ?? null,
    }
  } catch (err) {
    if (err?.response?.status === 401) {
      return {
        authenticated: false,
        role: null,
        catalystRole: null,
        userId: null,
        email: null,
        firstName: null,
        lastName: null,
      }
    }
    throw err
  }
}

/**
 * Send the browser to Catalyst's sign-in.
 *
 * Deliberately navigates to the project root rather than a hardcoded
 * `/__catalyst/auth/...` path: `client-package.json`'s `homepage` points at the
 * hosted login page, and the project root redirects to it. Catalyst owns the URL,
 * so this keeps working if that path ever changes.
 *
 * A full-page navigation, not a router push — we are leaving the SPA.
 */
export function redirectToSignIn() {
  window.location.assign('/')
}

/**
 * Ends the Catalyst session, then returns to sign-in.
 *
 * `/baas/logout` is the endpoint the CLI's own gateway auth cache keys off
 * (express_middlewares/auth-checker.js). Confirm it against your project on the
 * first deploy; if it differs, this is the single place to change.
 */
export function signOut() {
  window.location.assign('/baas/logout')
}
