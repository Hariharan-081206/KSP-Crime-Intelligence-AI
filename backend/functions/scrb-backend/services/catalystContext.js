// File: backend/services/catalystContext.js

/**
 * catalystContext
 * ---------------------------------------------------------------------------
 * Request-scoped access to the initialized Catalyst app.
 *
 * WHY THIS EXISTS
 * ---------------
 * The service layer was written assuming an ambient Catalyst app: callers do
 *
 *     datastoreService.getRecordById(TABLES.ACCUSED, id)      // 2 args
 *     relationshipService.getCasesForAccused(accusedId)       // 1 arg
 *
 * rather than passing `catalystApp` as the leading argument the exported
 * signatures actually declare. Both modules carry a legacy-arg shim that
 * detects a string/number in the first position, shifts the arguments, and
 * sets `catalystApp = null`. `executeQuery` then ran `null.zcql()` and threw
 * `TypeError: Cannot read properties of null (reading 'zcql')`, which the
 * calling adapter swallowed and turned into `null` / `[]`.
 *
 * Net effect before this module existed: every Data Store read reached through
 * networkGraphService or behaviouralProfileService failed silently. All four
 * `/graph/*` routes answered 404 "no network could be built" and
 * `/profile/behavioral` answered 500 — regardless of what was in the database.
 *
 * WHY AsyncLocalStorage AND NOT A MODULE-LEVEL SINGLETON
 * -----------------------------------------------------
 * `catalyst.initialize(req)` returns a *per-request* app that carries the
 * caller's identity — `userManagement().getCurrentUser()` resolves against it.
 * A module-level `let currentApp` would be overwritten by each incoming
 * request and, in a warm container serving concurrent requests, could hand one
 * user's identity to another user's request. In a system whose entire premise
 * is role-gated PII (investigator-only network graphs, analyst-only forecasts)
 * that is a privilege-escalation bug, not a style question.
 *
 * AsyncLocalStorage binds the app to the async execution context of the single
 * request that created it. Concurrent requests each see their own; nothing
 * leaks across them.
 *
 * PRECEDENCE
 * ----------
 * An explicitly passed `catalystApp` always wins. This module is a fallback
 * for the call sites that omit it, so code that already threads the app
 * correctly (mapController, buildGlobalNetworkGraph, the audit services) is
 * unaffected.
 */

import { AsyncLocalStorage } from 'node:async_hooks';

const storage = new AsyncLocalStorage();

/**
 * Run `fn` with `app` bound to the current async context.
 * Called once per request from the Catalyst init middleware in index.js.
 *
 * @param {object} app - the result of `catalyst.initialize(req)`
 * @param {Function} fn - continuation (Express `next`)
 */
export function runWithCatalystApp(app, fn) {
  return storage.run({ app }, fn);
}

/**
 * The Catalyst app bound to the in-flight request, or null outside one
 * (module load, unit tests, a Cron entry point that never set it).
 *
 * @returns {object|null}
 */
export function getCatalystApp() {
  return storage.getStore()?.app ?? null;
}

/**
 * Resolve the app to use for a data-layer call: the explicit argument when one
 * was passed, else the request-scoped one.
 *
 * Throws a named, actionable error rather than letting `null.zcql()` surface as
 * a bare TypeError several frames away from the cause — that indirection is
 * what made the original bug read like "no data" instead of "no app".
 *
 * @param {object|null} catalystApp
 * @param {string} caller - for the error message
 * @returns {object}
 */
export function resolveApp(catalystApp, caller = 'datastoreService') {
  const app = catalystApp ?? getCatalystApp();
  if (!app) {
    throw new Error(
      `[${caller}] No Catalyst app available. It was neither passed explicitly ` +
      `nor bound to the request context. Ensure the Catalyst init middleware in ` +
      `index.js wraps this call via runWithCatalystApp().`
    );
  }
  return app;
}

export default { runWithCatalystApp, getCatalystApp, resolveApp };
