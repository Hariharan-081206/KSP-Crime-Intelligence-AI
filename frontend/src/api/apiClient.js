import axios from 'axios'

// Single point of contact for the backend. `baseURL` points at the live
// Catalyst Function / API Gateway endpoint via VITE_API_BASE_URL (baked at
// build time); falls back to the `/api` same-origin proxy for local dev.
// Every feature module calls through this instance rather than axios directly.
const apiClient = axios.create({
  baseURL: import.meta.env.VITE_API_BASE_URL || '/api',
  timeout: 20000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// --- Session auth -----------------------------------------------------------
// Nothing to do here. Catalyst Authentication is cookie-based (ZD_CSRF_TOKEN +
// the Zoho IAM cookies), and the SPA is served same-origin with the API — the
// client at /app/*, the gateway at /api/* on one project domain — so the browser
// attaches the session to every request on its own.
//
// `withCredentials` is deliberately NOT set: it only governs cross-origin
// requests, and turning it on would require the backend to drop its allow-all
// CORS for a single explicit origin. Same-origin needs neither.
//
// Removed here: an `X-Auth-Token` / `X-User-Id` dev-header scheme. The backend
// authenticates via the Catalyst session and never read those headers, so they
// were decorative — and a header the client controls must never decide identity.

// --- Response handling ------------------------------------------------------
// Router-agnostic error bus: the interceptor only dispatches window events so
// apiClient never imports React/router. AuthContext handles `scrb:unauthorized`
// (clears session → RequireAuth redirects to /login); GlobalToast renders
// `scrb:api-error`. Cancellations (AbortController) are passed through quietly.
apiClient.interceptors.response.use(
  (response) => {
    // Unwrap the backend's standard envelope `{ success, message, data }` → `data`
    // so feature services (which `return response.data`) receive the payload
    // directly — e.g. the /query controller returns `{ success, data: { answer,
    // intent, ... } }`, and ChatContext.toBotMessage then reads `data.answer`.
    // Blob responses (PDF/voice) and non-enveloped bodies pass through untouched.
    const body = response?.data
    if (
      body &&
      typeof body === 'object' &&
      !(body instanceof Blob) &&
      Object.prototype.hasOwnProperty.call(body, 'success') &&
      Object.prototype.hasOwnProperty.call(body, 'data')
    ) {
      response.data = body.data
    }
    return response
  },
  (error) => {
    if (error?.code === 'ERR_CANCELED') return Promise.reject(error)
    const status = error?.response?.status
    if (status === 401) {
      // The Catalyst session is gone or expired. AuthContext listens and hands
      // the browser back to Catalyst's sign-in.
      window.dispatchEvent(new Event('scrb:unauthorized'))
    } else if (status >= 500) {
      window.dispatchEvent(
        new CustomEvent('scrb:api-error', {
          detail: { message: 'The intelligence service is temporarily unavailable. Please try again.' },
        }),
      )
    }
    return Promise.reject(error)
  },
)

export default apiClient
