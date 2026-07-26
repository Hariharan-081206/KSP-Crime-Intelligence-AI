/**
 * scratch/verify_rbac_matrix.mjs
 *
 * Verification: proves the spec §8 route surface exists, that the §5 role
 * matrix is enforced on it, and that roles resolve from the Catalyst session —
 * without needing a Catalyst project or three real OAuth identities.
 *
 * HOW: boots index.js in-process with `catalyst.initialize()` stubbed. The stub's
 * getCurrentUser() returns an ICatalystUser-shaped object whose
 * role_details.role_name is whatever role the harness is impersonating, so
 * authMiddleware and roleMiddleware run for real against a synthetic identity.
 * Data reads return empty sets.
 *
 * WHAT THIS PROVES: routing (path is mounted); authMiddleware + roleMiddleware
 * wired to each route with the right allow-list; and that role names from the
 * console normalize correctly, unmapped roles are refused with a diagnostic
 * message, and authorization never touches the Data Store.
 *
 * WHAT THIS DOES NOT PROVE: that real Catalyst Authentication resolves a
 * session, or that the console's role names match what this expects. Those still
 * need the `catalyst serve` / deployed run documented in RBAC_VERIFY.md.
 *
 * Run:  node scratch/verify_rbac_matrix.mjs     (from functions/scrb-backend)
 * Exit: 0 = all pass, 1 = at least one assertion failed.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalyst = require('zcatalyst-sdk-node');

// Mutated per request; the harness issues requests strictly sequentially.
let CURRENT_ROLE = null;
let AUTHENTICATED = true;

// Every ZCQL query the app issues, so we can assert the UserRoles table is
// never consulted again.
const zcqlQueries = [];

const stubApp = {
  zcql: () => ({
    executeZCQLQuery: async (q) => {
      zcqlQueries.push(String(q));
      return [];
    },
  }),
  userManagement: () => ({
    // Mirrors ICatalystUser: user_id and zuid are distinct, and the role rides
    // along in role_details.role_name (set in the Catalyst console). The role no
    // longer comes from a Data Store table, so there is nothing to stub in ZCQL.
    getCurrentUser: async () =>
      AUTHENTICATED
        ? {
            user_id: 'user-test-001',
            zuid: 'zuid-test-001',
            email_id: 'tester@example.com',
            role_details: CURRENT_ROLE ? { role_id: 'r1', role_name: CURRENT_ROLE } : undefined,
          }
        : null,
  }),
  datastore: () => ({ table: () => ({ getPagedRows: async () => ({ data: [] }) }) }),
  quickML: () => ({ model: () => ({ predict: async () => ({ predictions: [] }) }) }),
  cache: () => ({ segment: () => ({ get: async () => null, put: async () => null }) }),
};
catalyst.initialize = () => stubApp;

const { default: app } = await import('../index.js');

const server = app.listen(0);
await new Promise((resolve) => server.once('listening', resolve));
const base = `http://127.0.0.1:${server.address().port}`;

async function hit([method, path, body]) {
  const res = await fetch(base + path, {
    method,
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body ? JSON.stringify(body) : undefined,
  });
  let message = '';
  try {
    message = (await res.clone().json()).message ?? '';
  } catch {
    message = '';
  }
  // The app's catch-all answers "Route not found : …" — that is the only 404
  // that means "not mounted". A handler's own 404 means the route matched.
  return { status: res.status, unmounted: res.status === 404 && /^Route not found/.test(message) };
}

/**
 * Spec §8 endpoints in Step-4 scope, with the allow-list from
 * REMEDIATION_LOG.md's per-endpoint role matrix.
 */
const CASES = [
  { ep: ['GET', '/auth/role'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['POST', '/query', { query: 'ping' }], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['GET', '/map/hotspots'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['GET', '/map/district/D1'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['GET', '/graph/network'], allow: ['Investigator'] },
  { ep: ['GET', '/graph/network?caseId=CASE-1'], allow: ['Investigator'] },
  { ep: ['GET', '/graph/network?accusedId=ACC-1'], allow: ['Investigator'] },
  { ep: ['GET', '/profile/behavioral?accused_id=ACC-1'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['POST', '/predict/forecast', { region: 'D1', horizon: '30d' }], allow: ['Analyst'] },
  { ep: ['GET', '/alerts/active'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['GET', '/conversation/sess-1'], allow: ['Policymaker', 'Investigator', 'Analyst'] },
  { ep: ['POST', '/export/pdf', { session_id: 'sess-1' }], allow: ['Policymaker', 'Investigator', 'Analyst'] },
];

const ROLES = ['Policymaker', 'Investigator', 'Analyst'];
const rows = [];
let failures = 0;

for (const { ep, allow } of CASES) {
  const cells = [];

  for (const role of ROLES) {
    AUTHENTICATED = true;
    CURRENT_ROLE = role;
    const { status, unmounted } = await hit(ep);
    const passed = unmounted ? false : allow.includes(role) ? status !== 403 : status === 403;
    if (!passed) failures++;
    cells.push(`${role[0]}:${status}${passed ? '' : ' <-FAIL'}`);
  }

  AUTHENTICATED = false;
  CURRENT_ROLE = null;
  const anon = await hit(ep);
  if (anon.status !== 401) failures++;
  cells.push(`anon:${anon.status}${anon.status === 401 ? '' : ' <-FAIL'}`);

  rows.push(`${`${ep[0]} ${ep[1]}`.padEnd(46)} ${cells.join('  ')}`);
}

console.log('\n=== spec §8 surface x role matrix (P/I/A = role, value = HTTP status) ===');
console.log('PASS = allowed role not 403, disallowed role 403, anon 401, never "route not found"\n');
console.log(rows.join('\n'));

// ---------------------------------------------------------------------------
// Role resolution from the Catalyst session (not the old UserRoles table).
//
// The matrix above would pass whether or not normalization works, because it
// only ever feeds canonical role names. These check the parts it cannot see.
// ---------------------------------------------------------------------------
const roleChecks = [];

async function roleCheck(label, expected, actual) {
  const passed = expected === actual;
  if (!passed) failures++;
  roleChecks.push(`${passed ? 'PASS' : 'FAIL'}  ${label} — got ${actual}, want ${expected}`);
}

AUTHENTICATED = true;

// NB: /auth/role is intentionally authMiddleware-only — the SPA calls it to
// *discover* its role, so gating it on already having a valid one is circular.
// It answers 200 with role:null for an unmapped user. Role refusal therefore has
// to be probed on an actually role-gated route; /alerts/active allows all three.
const GATED = ['GET', '/alerts/active'];

// A console role spelled differently still resolves to Policymaker.
for (const variant of ['policymaker', 'POLICYMAKER', 'Policy Maker', 'policy_maker']) {
  CURRENT_ROLE = variant;
  const { status } = await hit(GATED);
  await roleCheck(`console role '${variant}' resolves to Policymaker`, 200, status);
}

// …and is still denied an Analyst-only route, i.e. it resolved to the *right*
// role rather than merely to something non-null.
CURRENT_ROLE = 'POLICY_MAKER';
const forecastAsPolicymaker = await hit(['POST', '/predict/forecast', { region: 'D1', horizon: '30d' }]);
await roleCheck("'POLICY_MAKER' is still refused the Analyst-only forecast", 403, forecastAsPolicymaker.status);

// Catalyst's built-in roles are not SCRB roles.
for (const builtin of ['App User', 'App Administrator']) {
  CURRENT_ROLE = builtin;
  const { status } = await hit(GATED);
  await roleCheck(`built-in Catalyst role '${builtin}' is refused`, 403, status);
}

// Signed in with no role assigned at all.
CURRENT_ROLE = null;
const noRole = await hit(GATED);
await roleCheck('signed in with no role assigned is refused', 403, noRole.status);

// /auth/role still answers for an unmapped user, with role:null — that is what
// lets the SPA tell "no role assigned" apart from "not signed in".
CURRENT_ROLE = 'App User';
const discover = await fetch(`${base}/auth/role`);
const discoverBody = await discover.json().catch(() => ({}));
await roleCheck('/auth/role answers an unmapped user (role discovery)', 200, discover.status);
const nullRole = discoverBody?.data?.role ?? null;
if (nullRole !== null) failures++;
roleChecks.push(
  `${nullRole === null ? 'PASS' : 'FAIL'}  /auth/role reports role:null for an unmapped user — ` +
    `role=${JSON.stringify(nullRole)} catalystRole=${JSON.stringify(discoverBody?.data?.catalystRole ?? null)}`
);

// The 403 has to say *why*, or a misconfigured console role is undiagnosable.
CURRENT_ROLE = 'App User';
const res = await fetch(`${base}${GATED[1]}`);
const body = await res.json().catch(() => ({}));
const namesRawRole = /App User/.test(body.message ?? '');
if (!namesRawRole) failures++;
roleChecks.push(
  `${namesRawRole ? 'PASS' : 'FAIL'}  the 403 names the unmapped console role — ${JSON.stringify(body.message ?? null)}`
);

// The whole point of the change: no Data Store round-trip for authorization.
const touchedUserRoles = zcqlQueries.filter((q) => /UserRoles/i.test(q));
if (touchedUserRoles.length !== 0) failures++;
roleChecks.push(
  `${touchedUserRoles.length === 0 ? 'PASS' : 'FAIL'}  UserRoles table never queried — ` +
    `${zcqlQueries.length} ZCQL queries, ${touchedUserRoles.length} mentioning UserRoles`
);

console.log('\n=== role resolution from the Catalyst session ===\n');
console.log(roleChecks.join('\n'));

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);

process.exitCode = failures === 0 ? 0 : 1;
server.close();
