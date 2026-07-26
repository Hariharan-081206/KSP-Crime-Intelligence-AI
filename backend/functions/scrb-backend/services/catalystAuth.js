// ============================================================================
// File: backend/services/catalystAuth.js
// ============================================================================
//
// Zoho auth headers for hand-rolled calls to Catalyst-hosted APIs.
//
// WHY THIS EXISTS
// ---------------
// The QuickML endpoints authenticate with a Zoho **OAuth token**, not with the
// endpoint key. Verified against the live project:
//
//   POST $RAG_ANSWER_URL  + X-QUICKML-ENDPOINT-KEY   -> 400 INVALID_TICKET
//   POST $RAG_ANSWER_URL  with NO key at all         -> 400 INVALID_TICKET  (identical)
//   POST $RAG_ANSWER_URL  + a bogus OAuth token      -> 401 INVALID_OAUTHTOKEN
//   POST <nonsense path on the same host>            -> 404 (HTML)
//
// The identical response with and without the key proves the key is not being
// read; the *different* response to a bogus token proves OAuth is the mechanism;
// and the 404 on a bad path proves routing precedes auth — so the configured
// URL and project id were correct all along. The endpoint key is still required
// (the SDK sends it too), it is just not sufficient on its own.
//
// `zcatalyst-sdk-node` attaches this token automatically for calls made through
// its own bindings (catalyst-app.js -> authenticateRequest). Anything reaching
// for `fetch()` directly — ragService did — carries no credential and gets
// INVALID_TICKET, in the deployed function exactly as from a laptop.
//
// PREFER THE SDK. Use this module only where the SDK has no binding for the
// path. `/quickml/v1/project/<id>/endpoints/predict` has one
// (`app.quickML().predict()`); `/quickml/v1/project/<id>/rag/answer` does not.
//
// The branching below mirrors CatalystAppInternals.authenticateRequest so a
// function running under any of the credential types the platform hands out
// (access token, ticket, or cookie + CSRF) is covered rather than only the one
// this deployment happens to use today.
//
// SECOND FINDING (after the first deploy of this file): sending *a* token is not
// enough — it has to be the ADMIN-scope one. See buildAuthHeaders() below. The
// first version returned the signed-in user's token and Zoho answered
// `401 INVALID_OAUTHTOKEN`, one step further along than the original
// `400 INVALID_TICKET` but still refused.
// ============================================================================

import { resolveApp } from './catalystContext.js';
import logger from '../utils/logger.js';

/**
 * Build the Zoho credential headers for an outbound Catalyst API call.
 *
 * @param {object|null} [catalystApp] explicit app; falls back to the
 *   request-scoped one bound by the init middleware in index.js.
 * @param {string} [caller] for error messages.
 * @returns {Promise<Record<string,string>>} headers to merge into the request
 * @throws when no Catalyst app is available, or the credential yields no token
 */
export async function buildAuthHeaders(catalystApp = null, caller = 'catalystAuth') {
  const app = resolveApp(catalystApp, caller);

  const credential = app?.credential;
  if (!credential || typeof credential.getToken !== 'function') {
    throw new Error(`[${caller}] Catalyst app exposes no credential to authenticate with.`);
  }

  // ---- ADMIN SCOPE IS MANDATORY --------------------------------------------
  // CatalystCredential holds TWO credentials and returns whichever the current
  // scope selects (credential.js, `getToken()`):
  //
  //   currentUser === 'admin'  -> adminCred  (the application's own identity)
  //   currentUser === 'user'   -> userCred   (the signed-in SCRB officer)
  //
  // and its constructor initialises `currentUser` to 'user'. So calling
  // getToken() directly hands back the END USER's token. That token is a portal
  // user session; QuickML's management APIs do not accept it, and answer
  // `401 INVALID_OAUTHTOKEN` — the exact error this call was producing.
  //
  // The SDK never hits that because AuthorizedHttpClient.send() calls
  // `switchUser(request.user)` before authenticating, and QuickML.predict()
  // declares `user: CREDENTIAL_USER.admin`. Anything hand-rolled has to do the
  // same switch, then put the scope back: the app object is shared for the
  // lifetime of the request, and leaving it in admin scope would make a later
  // `userManagement().getCurrentUser()` resolve the wrong identity — which on a
  // role-gated PII system is a privilege bug, not a cosmetic one.
  const previousUser = typeof credential.getCurrentUser === 'function'
    ? credential.getCurrentUser()
    : null;

  let token;
  try {
    if (typeof credential.switchUser === 'function') {
      const scope = credential.switchUser('admin');
      if (scope !== 'admin') {
        // switchUser is a no-op when the app was initialised with a strict user
        // scope. Say so explicitly rather than sending a user token and letting
        // Zoho reply with an error that names none of this.
        throw new Error(
          `[${caller}] Catalyst app is locked to '${scope}' scope, so no admin ` +
          'credential is available. QuickML APIs require the application ' +
          'identity — initialise the app without a user scope for this call.'
        );
      }
    }
    token = await credential.getToken();
  } finally {
    if (previousUser && typeof credential.switchUser === 'function') {
      credential.switchUser(previousUser);
    }
  }

  // Project-context headers. AuthorizedHttpClient.send() attaches these to every
  // non-external call, including QuickML's, so mirror them: the credential
  // identifies *who* is calling, these identify *which project and environment*
  // the call belongs to.
  const project = {};
  if (app?.config?.projectKey) project['x-zc-project-key'] = app.config.projectKey;
  if (app?.config?.environment) {
    project['x-zc-environment'] = app.config.environment;
    project.ENVIRONMENT = app.config.environment;
  }
  if (app?.config?.projectSecretKey) {
    project['x-zc-project-secret-key'] = app.config.projectSecretKey;
  }
  project['x-zc-user-type'] = 'admin';

  if (token?.access_token) {
    return { ...project, Authorization: `Zoho-oauthtoken ${token.access_token}` };
  }
  if (token?.ticket) {
    return { ...project, Authorization: `Zoho-ticket ${token.ticket}` };
  }
  if (token?.cookie) {
    const headers = { ...project, Cookie: token.cookie };
    // The CSRF token travels with the cookie credential; without it the write
    // is rejected even though the session itself is valid.
    if (token.zcrf_header) headers['X-ZCSRF-TOKEN'] = token.zcrf_header;
    return headers;
  }

  logger.error(`[${caller}] credential.getToken() returned no usable credential`, {
    keys: token && typeof token === 'object' ? Object.keys(token) : typeof token,
  });
  throw new Error(
    `[${caller}] Could not obtain a Zoho credential for the outbound call. ` +
    'Without one, Catalyst-hosted endpoints answer 400 INVALID_TICKET.'
  );
}

export default { buildAuthHeaders };
