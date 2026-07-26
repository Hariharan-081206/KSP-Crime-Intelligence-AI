# RBAC Verification — scrb-backend (Phase 1, Steps 2 + 4)

Proves role enforcement is at the **infrastructure level** (spec §7.11/§7.16), not just the UI. Auth model: **real Catalyst Authentication** (`authMiddleware` → `getCurrentUser()`; `roleMiddleware` → `UserRoles.ROLE_NAME`).

> **Status: code-level VERIFIED ✅ · live-identity check still pending ⏸**
>
> Paths below are the **post-Step-4** spec §8 surface (the paths the SPA actually calls).
>
> **Verified automatically (`node scratch/verify_rbac_matrix.mjs`, 2026-07-25): ALL PASS** — every §8 route is mounted, every allowed role gets past its gate, every disallowed role gets **403**, and every unauthenticated call gets **401**. Full matrix below.
>
> **Verified live (local `catalyst serve`, 2026-07-25):** `GET /health` → **200** (relationship cache loaded); unauthenticated `POST /query` → **401** `"No active user session found."`
>
> **Still pending (your side):** the same matrix against **real Catalyst identities** — the harness stubs `catalyst.initialize()`, so it proves the middleware wiring and the allow-lists, *not* that Catalyst Authentication resolves a session or that `UserRoles` is seeded correctly.

## Automated check (no Catalyst project needed)

```bash
cd backend/functions/scrb-backend
node scratch/verify_rbac_matrix.mjs      # exit 0 = all pass
```

The harness boots `index.js` in-process with the Catalyst SDK stubbed: the stub answers the `UserRoles` lookup with whichever role it is impersonating, so `authMiddleware` and `roleMiddleware` execute for real against a synthetic identity. Data reads return empty sets — irrelevant, this proves routing + guards.

### Result — 2026-07-25 (P/I/A = Policymaker/Investigator/Analyst, value = HTTP status)

```
GET /auth/role                                 P:200  I:200  A:200  anon:401
POST /query                                    P:500  I:500  A:500  anon:401
GET /map/hotspots                              P:200  I:200  A:200  anon:401
GET /map/district/D1                           P:200  I:200  A:200  anon:401
GET /graph/network                             P:403  I:404  A:403  anon:401
GET /graph/network?caseId=CASE-1               P:403  I:404  A:403  anon:401
GET /graph/network?accusedId=ACC-1             P:403  I:404  A:403  anon:401
GET /profile/behavioral?accused_id=ACC-1       P:500  I:500  A:500  anon:401
POST /predict/forecast                         P:403  I:403  A:200  anon:401
GET /alerts/active                             P:200  I:200  A:200  anon:401
GET /conversation/sess-1                       P:404  I:404  A:404  anon:401
POST /export/pdf                               P:404  I:404  A:404  anon:401

ALL PASS
```

Reading the non-200s — all of them are the request getting **past** the role gate and failing in the data/integration layer, which is what this proof requires:

- `500` on `/query` — RAG endpoint not configured (expected, see Step 3).
- `500` on `/profile/behavioral` — Data Store read fails (see the Step-5 finding on `catalystApp` plumbing).
- `404` on `/graph/network` **for the Investigator only** — the handler's own "no network could be built", not a routing 404. Policymaker/Analyst are stopped earlier at **403**, which is the investigator-only PII assertion holding.
- `404` on `/conversation` and `/export/pdf` — the handler's "no thread found" for a session id that does not exist.

The harness distinguishes a handler 404 from the app's catch-all `"Route not found : …"`; only the latter counts as a missing route, and none occurred.

## Assertion model

RBAC passes when a **disallowed** role gets **403**, an **allowed** role gets **anything but 403**, and an unauthenticated call gets **401**. A 400/404/500 from an allowed role still means the gate let it through — data may fail until the Data Store is seeded, which is fine for *this* proof.

## Live-identity run (still to do — your side)

### Prerequisites (not doable from the backend code)
1. **Catalyst Authentication enabled** on the project so requests carry a real session/OAuth identity (`getCurrentUser()` resolves).
2. **`UserRoles` table seeded** — one row per test user: `ZUID`, `EMAIL`, `ROLE_NAME` ∈ `{Policymaker, Investigator, Analyst}` (exact capitalization — `constants.js` `ROLES`).
3. Three authenticated identities (one per role). Each curl carries that identity — with Catalyst that is an OAuth token header `Authorization: Zoho-oauthtoken <TOKEN>` **or** the session cookie, depending on how you expose `catalyst serve`. Substitute `$POLICYMAKER`, `$INVESTIGATOR`, `$ANALYST` below.
4. **Not covered here (browser only):** for the real SPA, cookie auth needs `withCredentials: true` on `apiClient` + credentialed CORS (`cors({ origin: <SPA-origin>, credentials: true })` — currently `cors()` allow-all). Not required for these curl checks. Flagged for deploy.

### Run
```bash
catalyst serve                       # your project, from backend/
BASE=http://localhost:3000/server/scrb-backend   # adjust to the served URL
```

### Investigator-only — network graph (the core PII assertion)
```bash
# Must be 403 for policymaker + analyst; NOT 403 for investigator
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Zoho-oauthtoken $POLICYMAKER"  "$BASE/graph/network"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Zoho-oauthtoken $ANALYST"      "$BASE/graph/network"
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Zoho-oauthtoken $INVESTIGATOR" "$BASE/graph/network"
```

### Analyst-only — forecast
```bash
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Zoho-oauthtoken $POLICYMAKER"  -H "Content-Type: application/json" -d '{"region":"D1","horizon":"30d"}' "$BASE/predict/forecast"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Zoho-oauthtoken $INVESTIGATOR" -H "Content-Type: application/json" -d '{"region":"D1","horizon":"30d"}' "$BASE/predict/forecast"
curl -s -o /dev/null -w "%{http_code}\n" -X POST -H "Authorization: Zoho-oauthtoken $ANALYST"      -H "Content-Type: application/json" -d '{"region":"D1","horizon":"30d"}' "$BASE/predict/forecast"
```

### All-roles (must be **not-403** for every role)
`GET /auth/role` · `POST /query` · `GET /map/hotspots` · `GET /map/district/:id` · `GET /profile/behavioral?accused_id=…` · `GET /alerts/active` · `GET /conversation/:sessionId` · `POST /export/pdf`

### Unauthenticated (no auth header) — must be **401** everywhere
```bash
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/map/hotspots"    # expect 401
curl -s -o /dev/null -w "%{http_code}\n" "$BASE/graph/network"   # expect 401
```

## Policymaker-only — strategic report (non-§8, retained)
| Endpoint | Policymaker | Investigator | Analyst |
|---|---|---|---|
| `GET /report/summary?zone=3` | not-403 | **403** | **403** |

## What changed

**Step 2 (guards):**
- `router.use(authMiddleware, roleMiddleware(...))` added to **mapRoutes** (all), **networkGraphRoutes** (Investigator), **behaviouralProfileRoutes** (all).
- Uncommented + corrected per-route guards: **queryRoutes** (all), **forecastRoutes** (Analyst — was `ALL_ROLES`), **alertsRoutes** (all), **authRoutes** `/assign-role` (Policymaker).
- Fixed the dead-401 middleware order (audit P1-2) on **historyRoutes**, **exportRoutes**, **reportRoutes** by re-enabling `authMiddleware` before `roleMiddleware`. `exportRoutes` widened `Policymaker`→all-roles per the §5 export permission.

**Step 4 (paths):** the guarded routes moved to the spec §8 surface — see `REMEDIATION_LOG.md` Step 4 for the full rename table. The guards themselves were not changed.
