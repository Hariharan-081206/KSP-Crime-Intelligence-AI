# SCRB — testing the deployed Catalyst project

Companion to `DEPLOY.md`. That file covers *how to ship*; this one covers *how to
prove it works* once shipped, in the order the layers actually fail.

**Live URL (Development env, India DC):**

```
https://project-rainfall-60077984142.development.catalystserverless.in/app/index.html
```

Not `.com` — the project is in the `in` data centre. Not `/` and not `/app/`:
both currently 404 (§3.1).

---

## 0. Read this first — the white-screen blocker

**Symptom:** the app paints, then goes fully blank after 2–3 seconds.

**Two causes, stacked.** The second only became visible once the first was fixed
— see §6 for both. What follows is the first.

**Cause, confirmed:** `src/components/map/DistrictOutlines.jsx` fetched
`assets/karnataka-districts.min-*.geojson`. The API Gateway does not serve that
file — it returns HTTP 404 with a *well-formed JSON body*:

```json
{"status":"failure","data":{"message":"Invalid API …","error_code":"INVALID_URL"}}
```

The old code called `r.json()` without checking `r.ok`, so the failure parsed
cleanly and was handed to Leaflet as if it were map data. Leaflet 1.9.4's
`geometryToLayer` hits its `default:` branch and throws `Invalid GeoJSON
object.` out of render. The app had **no error boundary**, so React unmounted the
entire tree — a white page. The 2–3 second delay is the lazily-loaded
`RightPanel` → `CrimeMap` chunk arriving after the shell has painted.

Two fixes are already applied in `frontend/src` (§6). Both still need the
gateway fixed (§1) for the map to actually draw district boundaries — but with
the code fix, a missing geojson degrades to "map without outlines" instead of
killing the app.

---

## 1. Prerequisites — console-side, cannot be tested around

| # | Item | How to check | State |
|---|---|---|---|
| 1.1 | API Gateway enabled | `cd backend && catalyst apig:status` | ✅ ENABLED |
| 1.2 | `/api/{path:(.*)}` → `/server/scrb-backend/{path}` rule | `curl .../api/health` returns **401**, not 404 | ✅ live |
| 1.3 | `/app/{path:(.*)}` → client catch-all | `curl .../app/icons.svg` | ❌ returns gateway `INVALID_URL` |
| 1.4 | 3 users with SCRB roles assigned | Console → Authentication → Manage Application Users | ✅ per DEPLOY.md §1.5 |
| 1.5 | `RAG_*`, `QUICKML_FORECAST_MODEL_ID` env vars | Console → Functions → scrb-backend → Configuration | ❌ empty per DEPLOY.md §2 |

### Fixing 1.3

The live rule set does not match `backend/catalyst-user-rules.json`. Evidence:

| Path | Result |
|---|---|
| `/app/index.html` | 200 |
| `/app/assets/*.js`, `/app/assets/*.css` | 200 |
| `/app/assets/*.geojson` | 404 gateway `INVALID_URL` |
| `/app/icons.svg`, `/app/favicon.svg` | 404 gateway `INVALID_URL` |
| `/app/404.html`, `/app/` | 404 gateway `INVALID_URL` |

A request for a *nonexistent* `.js` returns the SPA's own HTML 404 fallback, so
`.js` requests reach client hosting while `.geojson` requests never do — the
gateway is rejecting by path before client hosting sees them.

1. Console → API Gateway → Rules. Compare against
   `backend/catalyst-user-rules.json` (two rules: `backend-gateway`,
   `spa-client`).
2. Delete the 8 stale rules per DEPLOY.md §1.2 — 4 point at deleted functions
   and all 8 expose unauthenticated Data Store writes. They are also the most
   likely reason `.js` resolves and `.geojson` does not.
3. Ensure `spa-client` is `ANY /app/{path:(.*)}` → target `client`,
   `/app/{path}`, with **no** authentication (the SPA shell must load before
   sign-in, or the user cannot reach a sign-in button).
4. Re-verify: `curl -s -o /dev/null -w "%{http_code}" .../app/icons.svg` → 200.

**Fallback if the gateway will not serve `.geojson`:** bundle it instead of
fetching it. In `DistrictOutlines.jsx` swap
`import districtsUrl from '…/karnataka-districts.min.geojson?url'` for a `?raw`
import plus `JSON.parse`, dropping the `fetch` entirely. It lands the 2.8 MB
inside a `.js` chunk, which is known-served. Heavier download, zero gateway
dependency.

---

## 2. Layer 1 — infrastructure, no browser, no session

Run from anywhere. `$B` is the project domain.

```bash
B=https://project-rainfall-60077984142.development.catalystserverless.in

# SPA shell
curl -s -o /dev/null -w "index.html      %{http_code}\n" $B/app/index.html   # want 200
curl -s -o /dev/null -w "icons.svg       %{http_code}\n" $B/app/icons.svg    # want 200 (§1.3)

# Hosted sign-in page
curl -s -o /dev/null -w "hosted login    %{http_code}\n" $B/__catalyst/auth/login  # want 200

# API through the gateway — 401 is the PASS here. It proves the rule exists and
# CatalystUserManagement auth is enforced. 404 would mean the rule is missing.
curl -s -o /dev/null -w "api/health      %{http_code}\n" $B/api/health       # want 401
curl -s -o /dev/null -w "api/auth/role   %{http_code}\n" $B/api/auth/role    # want 401
```

Reading the failures:

| Response | Meaning |
|---|---|
| `{"error_code":"INVALID_URL"}` | No gateway rule matched. Rule problem, not app problem. |
| `{"error_code":"NO_ACCESS"}` 401 | Rule matched, auth enforced, you have no session. **Correct.** |
| SPA HTML with a 404 status | Reached client hosting, file missing. Build/upload problem. |
| 200 on `/api/*` without signing in | **Bad** — auth is not being enforced. |

Confirm the deployed bundle is the one you built:

```bash
cd frontend
diff <(tr -d '\r' < dist/index.html) <(curl -s $B/app/index.html) && echo "deploy is current"
```

Offline backend harnesses (no project, no network, both exit 0):

```bash
cd backend/functions/scrb-backend
node scratch/verify_rbac_matrix.mjs      # 11 §8 routes mounted + role-guarded
node scratch/verify_graph_traversal.mjs  # graph expands; 4 §8 contracts hold
```

---

## 3. Layer 2 — the browser, unauthenticated

Open `$B/app/index.html` in a **private/incognito window** (no Zoho session).

Expected: the SCRB card, "Sign in required", a **Sign in with Zoho** button, and
the three role descriptions greyed out as reference only. Roles are not
selectable by design — they come from the console.

If instead you get a blank page, open DevTools → Console *before* reloading and
read §5.

### 3.1 Known entry-point wrinkle

`/` 302s to `/app/`, which the gateway 404s. Only `/app/index.html` resolves.
After §1.3 is fixed, re-test `$B/` — it should reach the SPA. Until then, share
the full `/app/index.html` URL with testers, because "Sign in with Zoho" calls
`window.location.assign('/')` (`authService.js:74`) and will land on that same
404 page.

---

## 4. Layer 3 — authentication and role resolution

1. Click **Sign in with Zoho** (or open `$B/__catalyst/auth/login` directly).
2. Complete Zoho sign-in with one of the three provisioned users.
3. You should land back on `/app/index.html` via `login_redirect`.
4. DevTools → Network → find `auth/role`. This one request decides everything:

| `/api/auth/role` returns | App state | What it means |
|---|---|---|
| 200 `{role:"Investigator",…}` | the app | working |
| 200 `{role:null, catalystRole:"App User"}` | "No SCRB role assigned" screen | console role assignment is wrong, not a bug |
| 401 | "Sign in required" | session not established — check `login_redirect` |
| 404 / `INVALID_URL` | "Could not verify your session (HTTP 404)" | gateway rule problem |
| 500 | same error text, HTTP 500 | backend env vars (§1.5) |

Note `normalizeRole` (`utils/roles.js:49`) lowercases and strips separators, so
the console's `Investigator` maps to `investigator`. A role name outside the
three known values yields `role: null` → the "no role" screen.

**Sign-out:** `authService.signOut()` navigates to `/baas/logout`. If that path
404s on this project, that is the single constant to change
(`authService.js:85`).

---

## 5. Layer 4 — is it a crash or an empty state?

The app now has an error boundary (§6), so a component crash renders a message
with the error text instead of a white page. If you still get a white page:

1. DevTools → Console. `[ErrorBoundary]` lines carry the message and the
   component stack — that names the failing component directly.
2. `[DistrictOutlines]` lines mean the geojson is not being served (§1.3); the
   map loses outlines but nothing else breaks.
3. A white page with **nothing** in the console means the crash happened above
   the boundary — i.e. in `AuthProvider`, `SessionProvider`,
   `InvestigationProvider`, `ChatProvider`, or `HashRouter` in `App.jsx:100-113`.
4. DevTools → Network, filter by status ≥ 400, to see which call preceded it.

---

## 6. Code changes made while diagnosing

Two separate crashes were blanking the page, both in the map. The first hid the
second: fixing the geojson revealed `Invalid LatLng object: (undefined,
undefined)` underneath it.

| File | Change | Why |
|---|---|---|
| `src/components/map/DistrictOutlines.jsx` | `fetch` now rejects on `!r.ok` and on any body that is not a `FeatureCollection`; the catch logs `[DistrictOutlines]` | A 404 JSON body was being handed to Leaflet, which threw out of render |
| `src/api/services/mapService.js` | `getHotspots` normalises the backend's district aggregates to the map's contract | **Contract mismatch, §6.1** — the crash behind the crash |
| `src/components/map/HotspotMarkers.jsx` | Skips any hotspot without finite coordinates; coerces with `Number()` | Belt-and-braces: one bad row must drop a marker, not the view |
| `src/components/common/ErrorBoundary.jsx` + `.css` | New | The app had no boundary anywhere, so any render throw blanked the page |
| `src/App.jsx` | Wraps `<AppRoutes />`, inside the providers | A crashed view must not take session/chat state with it |
| `src/components/layout/AppShell.jsx` | Second boundary around `<Outlet />`, keyed by path | Keeps the top bar and sidebar alive so a broken view can be navigated out of, and clears on navigation |

### 6.1 The hotspots contract mismatch

`GET /map/hotspots` returns district aggregates
(`services/mapService.js` → `getCrimeHotspots`):

```json
[{ "district": "Bengaluru", "crimeCount": 42, "latitude": 12.97, "longitude": 77.59 }]
```

The map components consume `{ id, lat, lng, label, severity }`. Nothing
reconciled the two, so `hotspot.lat` was `undefined`, `CircleMarker` got
`center={[undefined, undefined]}`, and Leaflet threw out of render.

The frontend service now translates at the boundary — the same tactic
`normalizeRole` uses for role names — and accepts either spelling, so it keeps
working if the backend is later changed to emit `lat`/`lng`.

**One judgement call to review:** the backend sends a raw `crimeCount` and no
severity, but `HotspotMarkers` colours by `severity`. Rather than let every
marker fall back to green — which on a crime map asserts "nowhere is a hotspot"
— severity is derived by ranking each district against the busiest one in the
same response (≥66% high, ≥33% medium, else low). Those thresholds are a
placeholder. Replace them with the real definition, or have the backend send
severity.

Other endpoint contracts were checked while tracing this: `/alerts/active`
(risklevel → severity mapping, deliberate) and `/graph/network` (`source`,
`target`, `centrality` aligned in DEPLOY.md Step 5) are both reconciled already.
`/map/hotspots` was the one that was missed.

### 6.2 The expanded-record alias bug (backend)

**Symptoms:** one hotspot for the whole state instead of ~30 districts; the
criminal network rendering as isolated nodes labelled `#54650000000014575` with
no edges at all.

**Cause.** `relationshipService.expandRecord` names each expanded relation
`foreignKey.replace(/id$/i, '')` — the alias follows the **foreign key on the
source table**, not the name of the table it points at. From
`config/relationships.js`, `casemaster` gives:

| FK column | Alias | Target table |
|---|---|---|
| `policestationid` | `.policestation` | `unit` |
| `policepersonid` | `.policeperson` | `employee` |
| `crimemajorheadid` | `.crimemajorhead` | `crimehead` |
| `crimeminorheadid` | `.crimeminorhead` | `crimesubhead` |
| `casestatusid` | `.casestatus` | `casestatusmaster` |
| `courtid` | `.court` | `court` |

Both services read the *table* names in camelCase instead — `.unit`,
`.crimehead`, `.casestatusmaster`, `expandedCase.unitId`, `.CrimeHead`. There is
no `unitid` column on `casemaster` at all, and JS property access is
case-sensitive, so every one of those reads was `undefined` on every row. The
datastore was connected the whole time; the code was looking under keys that
never existed.

| File | Change |
|---|---|
| `services/mapService.js` | 13 reads: `.unit`→`.policestation`, `.crimehead`→`.crimemajorhead`, `.casestatusmaster`→`.casestatus`; header comment documenting the aliasing rule |
| `services/networkGraphService.js` | New `field()` helper (case-insensitive multi-key read) and a `safeLabel` that falls back to any `*name`/`*number`/`*title` column before `#ROWID`; unit, court, officer, crime head/sub-head, district, state, arrest unit, and all financial-transaction FK reads corrected |
| `scratch/verify_graph_traversal.mjs` | Fixture now uses `policestationid`, `unitname`, `districtname` — the real schema |

**Why the offline harness never caught it.** Its fixture gave `casemaster` a
`unitid` column, mirroring the traversal code rather than
`config/relationships.js`. A fixture written from the code under test asserts
only that the code agrees with itself. With the fixture corrected, the same 12
checks still pass — 5 nodes and 4 edges, the extra two being the unit and
district that the old code could not reach from `policestationid`.

Both files are backend, so this needs a **functions** redeploy:

```bash
cd backend
catalyst deploy --only functions:scrb-backend
```

**If the graph still shows only case nodes after this**, the remaining
possibility is data rather than code: `victim` / `accused` rows whose
`casemasterid` does not match any seeded case. Check with ZCQL in the console:

```sql
SELECT COUNT(ROWID) FROM accused WHERE casemasterid IS NOT NULL
```

### 6.3 QuickML: the endpoint key was never the credential

**Symptoms:** chat answers "could not reach the intelligence service"; forecast
throws. Both endpoints return `400 INVALID_TICKET`.

**It was not the URL, the project id, or the endpoint key.** Probed live:

| Request | Response | Conclusion |
|---|---|---|
| `POST $RAG_ANSWER_URL` + endpoint key | 400 `INVALID_TICKET` | baseline |
| same, **no key at all** | 400 `INVALID_TICKET`, identical | the key is not being read |
| same + a bogus OAuth token | 401 `INVALID_OAUTHTOKEN` | OAuth is the mechanism |
| a nonsense path on the same host | 404 (HTML) | routing precedes auth, so the real URL and project id are valid |
| `POST $QUICKML_FORECAST_ENDPOINT_URL` + key | 400 `INVALID_TICKET` | same story on the `api.` host |

Both QuickML endpoints authenticate on a **Zoho OAuth token**. The endpoint key
is necessary but not sufficient. `zcatalyst-sdk-node` attaches that token
automatically for calls made through its own bindings
(`catalyst-app.js` → `authenticateRequest`); `ragService` and `forecastService`
both used bare `fetch()`, which carries no credential — so they failed
identically in the deployed function and from a laptop. This was never missing
config: `.env` ships inside the deploy bundle and `index.js` does
`import 'dotenv/config'`, so the values were present the whole time.

| File | Change |
|---|---|
| `services/catalystAuth.js` | **New.** `buildAuthHeaders()` takes the token off the function's own Catalyst credential, mirroring the SDK's own branching (access token / ticket / cookie + CSRF) |
| `services/ragService.js` | `/rag/answer` has no SDK binding, so it keeps `fetch` but now sends the credential; `RAG_OAUTH_TOKEN` is demoted to a manual override for local probing |
| `services/forecastService.js` | Now calls `app.quickML().predict(KEY, { [DATE_FEATURE]: date })`. The SDK builds the identical path, so `QUICKML_FORECAST_ENDPOINT_URL` no longer routes anything and warns at startup if it points elsewhere |
| `scratch/verify_graph_traversal.mjs` | Stub exposed `.model(id).predict()`, a shape the real SDK does not have — so it green-lit code that could not work. Now mirrors `predict(endPointKey, inputData)`, and three new checks assert the SDK is used, the key is passed, and a number comes back |

`POST /predict/forecast` in the harness went from **500 to 200** with a real
`predictedCount` as a result.

**Do not put a token in `RAG_OAUTH_TOKEN` in a deployed environment.** Zoho
access tokens last about an hour; it would work once and then fail silently.

Rebuild and redeploy the client for these to reach the browser:

```bash
cd frontend
npm run predeploy          # npm ci && vite build && index.html -> 404.html
catalyst deploy --only client
```

Vite bakes `VITE_API_BASE_URL` at **build** time — editing `.env.production`
after a build changes nothing.

---

## 7. Layer 5 — per-role functional walkthrough

Sign in as each of the three users in turn. `ROLE_PERMISSIONS`
(`src/utils/roles.js:14`) is the source of truth for what should be reachable;
the sidebar hides what the role lacks, and `RequireRole` guards the route for
anyone who types the hash URL directly.

| Feature / route | Policymaker | Investigator | Analyst |
|---|---|---|---|
| `/#/` chat | ✅ | ✅ | ✅ |
| `/#/map` | ✅ | ✅ | ✅ |
| `/#/network` | ❌ | ✅ | ❌ |
| `/#/alerts` | ✅ | ✅ | ✅ |
| `/#/profile` | ✅ aggregate only, no PII | ✅ full | ✅ |
| `/#/case/:id` | ❌ | ✅ | ❌ |
| `/#/audit` | ✅ own | ✅ own | ✅ own + aggregate |
| Forecast panel | ❌ | ❌ | ✅ |
| Threshold editing | ❌ | ❌ | ✅ |
| Reasoning trace | ❌ | ✅ | ✅ |
| PDF export | ✅ | ✅ | ✅ |

**Negative test that matters most:** as Policymaker, navigate straight to
`/#/network`. You must be bounced, and `GET /api/graph/network` must return
**403** — the server gate, not just the hidden sidebar link. Client-side gating
alone is decorative on a PII system.

Per screen, check three things: it renders, it shows a loading state, and it
shows an error or empty state rather than a crash when the endpoint 404s.

---

## 8. Layer 6 — endpoint sweep with a real session

`frontend/scripts/catalyst-compat-check.mjs` is **not useful against this
deploy**: it sends an `Authorization` header, but the gateway wants the session
cookie, so every route reports `AUTH` whether or not it exists.

Instead, sweep from inside the signed-in tab, where the cookie is attached
automatically. DevTools → Console, on `/app/index.html`, paste:

```js
await (async () => {
  const B = '/api'
  const SID = 'probe-session', CID = 'CASE-0000-0000', DID = '29'
  const CHECKS = [
    ['GET', '/auth/role'],
    ['POST', '/query', { session_id: SID, query: 'ping', language: 'en' }],
    ['GET', '/graph/network'],
    ['GET', '/map/hotspots'],
    ['GET', `/map/district/${DID}`],
    ['GET', '/profile/behavioral'],
    ['POST', '/predict/forecast', { district: 'X', crime_type: 'Theft' }],
    ['POST', '/predict/explain', { district: 'X', crime_type: 'Theft' }],
    ['GET', '/alerts/active'],
    ['GET', `/conversation/${SID}`],
    ['POST', '/export/pdf', { session_id: SID }],
    ['GET', '/insights/demographic'],
    ['GET', `/case/${CID}/summary`],
    ['GET', `/case/${CID}/similar`],
    ['GET', `/case/${CID}/leads`],
    ['GET', `/case/${CID}/record`],
    ['GET', '/audit/log'],
    ['POST', '/audit/threshold', { crime_type: 'Theft', value: 20, unit: 'incidents/week' }],
    ['POST', '/voice/tts', { text: 'ping', language: 'en' }],
  ]
  const rows = []
  for (const [method, path, body] of CHECKS) {
    try {
      const res = await fetch(B + path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
      })
      const text = (await res.text()).slice(0, 120)
      const verdict =
        res.ok ? 'OK' :
        res.status === 403 ? 'ROLE-GATED' :
        res.status === 401 ? 'NO SESSION' :
        text.includes('INVALID_URL') ? 'NO GATEWAY RULE' :
        res.status === 404 ? 'NOT IMPLEMENTED' :
        res.status >= 500 ? 'SERVER ERROR' : 'OTHER'
      rows.push({ method, path, status: res.status, verdict, body: text })
    } catch (e) {
      rows.push({ method, path, status: '-', verdict: 'NETWORK', body: String(e) })
    }
  }
  console.table(rows)
})()
```

Interpreting a row:

| Verdict | Meaning |
|---|---|
| `OK` | reachable, happy path |
| `ROLE-GATED` | route exists, your role is not allowed — **correct** for the negative tests in §7 |
| `NO SESSION` | your cookie expired mid-sweep; sign in again |
| `NO GATEWAY RULE` | the gateway rejected it before the function saw it — infra, not code |
| `NOT IMPLEMENTED` | route genuinely missing in `scrb-backend` — expected for the §9 list |
| `SERVER ERROR` | function threw; check Console → Functions → Logs, usually a missing env var |

---

## 9. Expected failures — do not chase these

From `DEPLOY.md` §5. All of these are known at deploy time; a tester hitting one
has found the documented gap, not a regression.

| What you will see | Cause |
|---|---|
| Chat returns 500 | `RAG_*` env vars empty (§1.5) |
| Forecast throws | `QUICKML_FORECAST_MODEL_ID` empty (§1.5) |
| `/voice/stt`, `/voice/tts` 404 | not implemented |
| `/insights/demographic` 404 | not implemented |
| `/predict/explain` 404 | not implemented |
| `/case/*` (4 routes) 404 | not implemented — Case Record drawer degrades |
| `/audit/log`, `/audit/threshold` 404 | not implemented — audit view shows empty state |
| PDF export downloads a JSON blob | `POST /export/pdf` returns JSON, needs a SmartBrowz template decision |
| Map has no district outlines | geojson not served (§1.3) |
| Hotspot severity colours look arbitrary | derived from `crimeCount`, thresholds provisional (§6.1) |
| Chat answers "could not reach the intelligence service" | was `400 INVALID_TICKET` — fixed in §6.3, verify after the functions redeploy |
| Behavioral Profile shows "No accused selected" | correct — `/profile/behavioral` requires `?accused_id=`; pull an accused in via chat or a case first |
| No favicon in the tab | `favicon.svg` not served (§1.3) — cosmetic only |
| Network graph node types look off | topology vs `networkService.js` typedef, `weight` is constant 1 — product decision |

`icons.svg` also 404s but is **unreferenced** by the app (icons come from
`lucide-react`), so it has no effect.

---

## 10. Minimum sign-off checklist

- [ ] §1.3 fixed — `/app/icons.svg` and `/app/assets/*.geojson` return 200
- [ ] `$B/` reaches the SPA (not a gateway 404)
- [ ] Incognito load shows "Sign in required", not a blank page
- [ ] Sign-in completes and `/api/auth/role` returns a real SCRB role
- [ ] Each of the 3 users lands in the app with the correct sidebar
- [ ] Policymaker → `/#/network` is refused **and** `/api/graph/network` returns 403
- [ ] Map renders with district outlines and hotspots
- [ ] Sign-out via `/baas/logout` ends the session; reload shows "Sign in required"
- [ ] §8 sweep run as each role; every non-OK row maps to a §9 entry
- [ ] No `[ErrorBoundary]` lines in the console during a full walkthrough
