#!/usr/bin/env node
/**
 * Catalyst backend compatibility probe.
 *
 * Pings every endpoint the frontend calls (all 20 in src/api/endpoints.js)
 * against a running backend base URL and classifies the result, so you can
 * confirm the SPA's `endpoints.js` matches whatever the Catalyst function
 * actually exposes BEFORE go-live. Full contract: see API_ENDPOINTS.md.
 *
 * Usage:
 *   node scripts/catalyst-compat-check.mjs <BASE_URL> [authToken]
 *   # or set VITE_API_BASE_URL / VITE_AUTH_TOKEN in the environment
 *
 * Example (Catalyst Advanced I/O function):
 *   node scripts/catalyst-compat-check.mjs \
 *     https://your-project.development.catalystserverless.com/server/scrb-backend/api token-u001
 *
 * Interpretation:
 *   OK       2xx                      → reachable + happy path
 *   AUTH     401/403                  → route EXISTS (auth/role gate) → compatible
 *   EXISTS   400/422/500              → route EXISTS (bad/empty body) → compatible
 *   METHOD   405                      → route exists but method mismatch → FIX
 *   MISSING  404                      → route NOT found → INCOMPATIBLE
 *   NETWORK  fetch failed / CORS      → unreachable, DNS, or CORS not enabled
 */

const BASE = (process.argv[2] || process.env.VITE_API_BASE_URL || '').replace(/\/+$/, '')
const TOKEN = process.argv[3] || process.env.VITE_AUTH_TOKEN || 'token-u001'

if (!BASE) {
  console.error('Provide a base URL: node scripts/catalyst-compat-check.mjs <BASE_URL> [token]')
  process.exit(2)
}

// Mirror of src/api/endpoints.js (keep in sync — 20 endpoints). Sample ids used
// for :param routes. See API_ENDPOINTS.md for the full request/response contract.
const SID = 'compat-probe-session'
const CID = 'CASE-0000-0000'
const DID = '29' // sample district id for /map/district/:id
const CHECKS = [
  ['GET', '/auth/role'],
  ['POST', '/query', { session_id: SID, query: 'ping', language: 'en' }],
  ['POST', '/voice/stt'],
  ['POST', '/voice/tts', { text: 'ping', language: 'en' }],
  ['GET', '/graph/network'],
  ['GET', '/insights/demographic'],
  ['GET', '/map/hotspots'],
  ['GET', `/map/district/${DID}`],
  ['GET', '/profile/behavioral'],
  ['POST', '/predict/forecast', { district: 'X', crime_type: 'Theft' }],
  ['POST', '/predict/explain', { district: 'X', crime_type: 'Theft' }],
  ['GET', '/alerts/active'],
  ['GET', `/conversation/${SID}`],
  ['POST', '/export/pdf', { session_id: SID }],
  ['GET', `/case/${CID}/summary`],
  ['GET', `/case/${CID}/similar`],
  ['GET', `/case/${CID}/leads`],
  ['GET', `/case/${CID}/record`],
  ['GET', '/audit/log'],
  ['POST', '/audit/threshold', { crime_type: 'Theft', value: 20, unit: 'incidents/week' }],
]

function classify(status) {
  if (status >= 200 && status < 300) return 'OK'
  if (status === 401 || status === 403) return 'AUTH'
  if (status === 405) return 'METHOD'
  if (status === 404) return 'MISSING'
  return 'EXISTS'
}

const LABEL = {
  OK: '✅ OK     ',
  AUTH: '🔐 AUTH   ',
  EXISTS: '🟡 EXISTS ',
  METHOD: '⚠️  METHOD ',
  MISSING: '❌ MISSING',
  NETWORK: '🚫 NETWORK',
}

async function probe([method, path, body]) {
  const url = BASE + path
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'X-Auth-Token': TOKEN,
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    })
    return { method, path, status: res.status, verdict: classify(res.status) }
  } catch (err) {
    return { method, path, status: 0, verdict: 'NETWORK', err: err.message }
  }
}

const results = []
for (const check of CHECKS) {
  // sequential to keep output readable and avoid rate limits
  // eslint-disable-next-line no-await-in-loop
  results.push(await probe(check))
}

console.log(`\nCatalyst compatibility probe → ${BASE}\n${'-'.repeat(60)}`)
for (const r of results) {
  const code = r.status ? String(r.status).padStart(3) : '---'
  console.log(`${LABEL[r.verdict]}  ${code}  ${r.method.padEnd(4)} ${r.path}${r.err ? `  (${r.err})` : ''}`)
}

const missing = results.filter((r) => r.verdict === 'MISSING')
const method = results.filter((r) => r.verdict === 'METHOD')
const network = results.filter((r) => r.verdict === 'NETWORK')
console.log('-'.repeat(60))
console.log(`Reachable: ${results.length - missing.length - network.length}/${results.length} · Missing: ${missing.length} · Method-mismatch: ${method.length} · Network/CORS: ${network.length}`)
if (network.length === results.length) {
  console.log('\n⚠️  Every call failed at the network layer — check the base URL, that the function is deployed, and that CORS allows the SPA origin.')
}
process.exit(missing.length || method.length ? 1 : 0)
