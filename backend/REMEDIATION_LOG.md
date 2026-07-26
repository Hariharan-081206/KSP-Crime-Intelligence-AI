# Phase 1 Remediation Log — backend → spec §8 conformance

VC scope: **`backend/` only** (git init inside `backend/`; `frontend/` keeps its own repo; monorepo unification deferred until after the demo). Branch: `chore/pre-deploy-audit`. Decision: **frontend contract is authoritative**; reshape the backend. Only permitted frontend edit this phase: an envelope-unwrap interceptor in `frontend/src/api/apiClient.js`, committed to the frontend repo on its own branch.

Legend: ✅ done/verified · 🟡 in progress · ⏸ awaiting your approval · ⬜ not started

---

## Approved decisions (from you)
1. **Gateway:** single catch-all `ANY /api/{path:(.*)}` → `scrb-backend` (`/server/scrb-backend/{path}`); spec §8 paths implemented as Express route renames. Before Step 4: report whether `forecastController`/`networkGraphController`/`mapController` proxy to Python or reimplement locally.
2. **Network graph:** global graph is correct; `caseId`/`accusedId` are optional filters. Before Step 5: read `build_network_dataset/main.py` and report. Use degree centrality unless it already provides a measure. Cap unfiltered response (named constant).
3. **Git:** scope VC to `backend/` only; do not touch `frontend/.git`; `apiClient.js` commit → frontend repo, own branch.

## Step 0 — Version-control safety ✅ (done, corrected)
- Corrected an earlier mistake (root `git init`) → removed root `.git`; re-init inside `backend/`.
- `frontend/.git` untouched; `git -C frontend remote -v` → **empty** (no remote configured).
- `backend/.gitignore` ignores `.env`, `.env.*`, `node_modules/`, `.build/`, `.catalystrc`, `*.dist-info/`.
- ✅ `git status --porcelain | grep -i env` → **empty**. Ignored (verified `!!`): `.catalystrc`, `functions/{scrb-backend,predictforecast,predictexplain}/.env`.
- ✅ First commit = `.gitignore` alone (`c58275a`). `git ls-files | grep -i env` → **empty**.
- Reminder: `QUICKML_ENDPOINT_KEY` rotation (audit P0-2) still pending on your side.

## Step 1 — API Gateway path-rewrite VERIFY ✅ (approved)
Confirmed: Catalyst API Gateway supports request≠target path rewrite, regex path params, and wildcard catch-all `{path:(.*)}`. Approach approved: one `/api/{path:(.*)}` rule + Express-side route renames (route map in previous log revision / below). Gateway rewrites **paths only** — bodies/response shapes are handled in Express (Steps 3, 5).

## Step 2 — RBAC re-enable ✅ code applied · ⏸ actual-output verification pending (you run `catalyst serve`)

**Decisions (from you):** auth model = **Real Catalyst Authentication**; RBAC proof = **you run `catalyst serve`**. Prerequisites on your side (documented in `RBAC_VERIFY.md`): enable Catalyst Auth, seed `UserRoles`, and make the SPA establish a Catalyst session (current dummy-cred `LoginPage` does not).

**Applied (10 route files, one logical change):**
- `router.use(authMiddleware, roleMiddleware(...))` added to `mapRoutes` (all), `networkGraphRoutes` (**Investigator**), `behaviouralProfileRoutes` (all).
- Uncommented/corrected per-route: `queryRoutes` (all), `forecastRoutes` (**Analyst** — was `ALL_ROLES`), `alertsRoutes` (all), `authRoutes` `/assign-role` (Policymaker).
- Fixed dead-401 order (audit P1-2) on `historyRoutes`/`exportRoutes`/`reportRoutes` by re-enabling `authMiddleware` first; `exportRoutes` widened to all-roles per §5. Deeper functional repair of these three stays Phase 3.
- CORS credentialed-origin change deferred to deploy (needs concrete SPA origin; not required for curl proof).

**Verification:** `backend/RBAC_VERIFY.md` holds the role×endpoint curl matrix + prerequisites; awaiting your `catalyst serve` run to fill actual output.

**Finding:** backend auth is incompatible with the authoritative frontend:
- Backend: `getCurrentUser()` (Catalyst Authentication session) + `UserRoles` table + capitalized roles (`authMiddleware.js:24`, `authService.js:9-18`, `constants.js:3-7`).
- Frontend (authoritative): `X-User-Id`/`X-Auth-Token` dev-token headers, no Catalyst login, lowercase roles (`apiClient.js:34-35`, `authService.js` FE `ROLE_TOKENS`).
- ⇒ Re-enabling `authMiddleware` as-is 401s every frontend call. "Repair" must adapt auth to the FE header contract (demo) or wire real Catalyst Auth (needs FE login = out of scope).

**Per-endpoint role matrix** (derived from FE `roles.js` `ROLE_PERMISSIONS` + `App.jsx` gates; P = policymaker, I = investigator, A = analyst):

| Spec §8 endpoint | Allowed roles | This phase? | Notes |
|---|---|---|---|
| `POST /query` | P I A | ✓ | RequireAuth only (no feature gate) |
| `GET /map/hotspots`, `GET /map/district/:id` | P I A | ✓ | feature `map` |
| `GET /insights/demographic` | P I A | Phase 2 | feature `map` |
| `GET /graph/network` | **I only** | ✓ | feature `network` — investigator-only PII |
| `GET /profile/behavioral` | P I A | ✓ | feature `profile`; content masked by role |
| `POST /predict/forecast` | **A only** | ✓ | feature `forecast` |
| `POST /predict/explain` | **A only** | Phase 2 | feature `forecast` |
| `GET /alerts/active` | P I A | ✓ | feature `alerts` |
| `GET /conversation/:id` | P I A | ✓ | own session |
| `POST /export/pdf` | P I A | ✓ | feature `export` |
| `GET /case/:id/{summary,similar,leads,record}` | **I only** | Phase 2 | feature `case-detail` — investigator-only PII |
| `GET /audit/log` | P I A | Phase 2 | own rows; `audit-aggregate` = A only |
| `POST /audit/threshold` | **A only** | Phase 2 | feature `threshold-edit` |
| `GET /auth/role` | any authed | ✓ | — |

Investigator-only PII surfaces to protect server-side: `/graph/network`, `/case/*`. Analyst-only: `/predict/*`, `/audit/threshold`, audit-aggregate.

## Step 3 — Chat path end-to-end ✅ done (real request verified on local `catalyst serve`)
- **Part 1 (backend):** `POST /query` accepts `query` (spec §8); `question` kept as a backward-compatible alias (only the scratch test uses it); presence enforced in `queryController`. Files: `routes/queryRoutes.js`, `controllers/queryController.js`.
- **Part 2 (frontend):** unwrap interceptor in `apiClient.js`, committed to the **frontend** repo (`3dc3c4b`, branch `chore/pre-deploy-audit` — its first commit). Local proof 4/4 PASS that `{success,data:{answer}}` → `data.answer` resolves via `toBotMessage`; frontend build green.
- **Part 3 (real request) ✅** verified on local `catalyst serve` (Catalyst `node20` runtime pointed at the installed Node so `scrb-backend` serves; Python fns skipped, not needed). `/health` → 200 (cache loaded). `POST /query`:
  - empty `{}` → **400** `"query" is required` (guard holds, message updated)
  - `{"query":…}` → **500** (accepted → reaches ragService; 500 = RAG not configured, not our code)
  - `{"question":…}` alias → **500** (accepted via alias)
  - unauthenticated (auth restored) → **401** (RBAC live-proof)
  To exercise past auth, the `/query` gate was **temporarily** bypassed on local serve then **restored** (verified 401 after; no bypass remains in the file).

## Decision-#1 checkpoint (pre-Step-4) ✅ answered

**Question:** do `forecastController` / `networkGraphController` / `mapController` proxy to the Python functions, or reimplement locally?

**Answer: all three reimplement locally in Node. Nothing in `scrb-backend` ever invokes a Python function.** Verified by grepping the whole function for every outbound-call form (`.functions(`, `.execute(`, `axios`, `fetch`, `http(s).request`) — exactly **one** hit exists in the entire backend, `ragService.js:39`, and it calls an external RAG HTTP endpoint, not a Catalyst function.

| Controller | Path to data | Python equivalent | Relationship |
|---|---|---|---|
| `mapController` | → `mapService` → `datastoreService` (ZCQL over `casemaster` etc.) | `mapHotspot/main.py`, `build_hotspot_dataset/main.py` | **None.** The Python jobs *write* `hotspot_clusters`; `mapService` does not read that table — it recomputes from raw case rows. |
| `networkGraphController` | → `networkGraphService` (in-process recursive traversal, `MAX_DEPTH`/`MAX_NODES`) | `graphNetworks/main.py`, `build_network_dataset/main.py` | **None.** Python writes `offenderlinks`; the Node traversal never reads it. |
| `forecastController` | → `forecastService` → **Catalyst QuickML `model.predict()`** (`QUICKML_FORECAST_MODEL_ID`) | `predictforecast/main.py`, `build_forecast_results/main.py` | **None.** Node calls QuickML directly and synchronously; Python writes `forecast_results`, which Node does not read. |

**Consequence (the thing to decide):** this confirms audit P2-3 concretely — the Node and Python halves are two independent implementations of the same three features with **no authority defined**, and the Python side's outputs (`hotspot_clusters`, `offenderlinks`, `forecast_results`) are currently **write-only dead tables** with no trigger wiring (audit §2c). Nothing is broken by this today, since the frontend only ever reaches Node. It becomes a decision at Step 6 / deploy: either delete the Python duplicates, or make the Node services read their precomputed tables (which is also the fix for the ML-cold-start concern, audit P1-6).

## Step 4 — Route renames to the spec §8 surface ✅ done (verified, automated)

**Rename table** (Express mount + route, all in `scrb-backend`):

| Spec §8 path (what the SPA calls) | Was | File |
|---|---|---|
| `GET /auth/role` | `GET /auth/me` | `routes/authRoutes.js` |
| `POST /query` | (already correct, Step 3) | `routes/queryRoutes.js` |
| `GET /map/hotspots`, `GET /map/district/:districtId` | (already correct — path matched pre-Step-4) | `routes/mapRoutes.js` |
| `GET /graph/network` + optional `?caseId=`/`?accusedId=` | `GET /graph/network/:caseId` (bare path 404'd) | `routes/networkGraphRoutes.js` |
| `GET /profile/behavioral?accused_id=` | `GET /behaviour/profile/:accusedId` | `routes/behaviouralProfileRoutes.js` + mount |
| `POST /predict/forecast` | `POST /forecast` | `routes/forecastRoutes.js` + mount |
| `GET /alerts/active` | `GET /alerts` | `routes/alertsRoutes.js` |
| `GET /conversation/:sessionId` | `GET /history/:threadId` | mount only (`historyRoutes` mounted twice) |
| `POST /export/pdf` | `GET /export/:threadId` (no POST at all) | `routes/exportRoutes.js` |

**Capability preserved.** Every pre-rename form that had a distinct shape is retained alongside the §8 one — `GET /graph/network/:caseId`, `GET /profile/behavioral/:accusedId`, `GET /export/:threadId`, and `/history` as a legacy alias of `/conversation`. Only `/auth/me` was replaced outright (no caller, and `/auth/role` is the same handler). Non-§8 surfaces (`/report/*`, the other `/map/*` and `/graph/*` routes) are untouched.

**Supporting changes** (needed to make the renamed routes answerable, not shape work):
- `networkGraphController.getFullNetworkGraph` now treats `caseId`/`accusedId` as **optional query filters** and falls through to a new `networkGraphService.buildGlobalNetworkGraph()` when neither is given (decision #2). Unfiltered scope is capped by the named constant `GRAPH_LIMITS.GLOBAL_NETWORK_SEED_CASES = 25` seed cases, with `MAX_DEPTH`/`MAX_NODES` bounding expansion from each seed.
- `behaviouralProfileController.getProfileByAccusedId` resolves the id from `?accused_id=` (the SPA's form), `?accusedId=`, or the path param.
- `exportRoutes` handler shared between `POST /export/pdf` (id from `session_id` in the body) and the retained `GET /export/:threadId`.
- **Bug fixed:** every handler in `behaviouralProfileController` called `successResponse`/`errorResponse` as if they were pure body formatters (`res.status(x).json(errorResponse('msg'))`), but `utils/formatter.js` implements them as **responders** taking `(res, opts)`. Every response path in that controller threw `TypeError: res.status is not a function` into the global error handler. Corrected to the `(res, {statusCode, message, data})` convention — payloads unchanged. Grep confirms no other file misuses the convention.

**Verification ✅ — `node scratch/verify_rbac_matrix.mjs` → ALL PASS (exit 0).** New in-repo harness: boots `index.js` in-process with `catalyst.initialize()` stubbed so `authMiddleware`/`roleMiddleware` run for real against a synthetic identity, then asserts the §8 surface × role matrix. Proves all 11 §8 routes are mounted and correctly guarded (allowed role never 403, disallowed role always 403, anon always 401, and never the catch-all "Route not found"). Full output recorded in `RBAC_VERIFY.md`. This also completes the role-differentiated rows that Step 2 left blank at the code level; the real-Catalyst-identity run stays on your side.

Also probed the **other 11** `endpoints.js` paths: `/voice/stt`, `/voice/tts`, `/insights/demographic`, `/predict/explain`, `/case/:id/{summary,similar,leads,record}`, `/audit/log`, `/audit/threshold` all return the catch-all 404 — as expected, these are **new features, not renames** (Phase 2), and no rename can produce them.

`scratch/test_api_endpoints.js` updated to the post-rename surface (it still listed `/auth/me`, `/behaviour/*`, `/alerts`, `/forecast`, `/history`), and its summary now counts a 404 as a routing failure rather than a "handled response".

### Findings for Step 5 (do not fix in Step 4)

1. **`/graph/network` and `/profile/behavioral` are mounted and guarded but cannot return data — `catalystApp` is dropped before every Data Store read.** `networkGraphService`'s adapters call `datastoreService.getRecordById(tableName, id)` and `getRecordsByField(tableName, field, value)` — i.e. **without** the leading `catalystApp`. Those functions carry a legacy-arg shim that, on seeing a string first argument, shifts the args and sets `catalystApp = null`; `executeQuery` then does `null.zcql()`. Observed stack: `executeQuery (datastoreService.js:172) ← getById (260) ← getRecordById (811) ← networkGraphService.getRecordById (71) ← traverseCase (295)` → `TypeError: Cannot read properties of null (reading 'zcql')`. The adapter swallows it and returns `null`, so the traversal yields an empty graph and the controller answers **404 "No network could be built"** on every call. `behaviouralProfileService.fetchAccusedRecord` (line 247) has the identical defect. Affects all four `/graph/*` routes and `/profile/*`. Fix = thread `catalystApp` from `req` through the service entry points; it is the precondition for any network-graph shape work.
2. `queryController` logs via `auditService.log()` (action/user/details) rather than `logConversation({ threadId, … })`, so no row is ever keyed by the SPA's client-generated `session_id` — `GET /conversation/:sessionId` will 404 for real sessions even though the route is correct.
3. `POST /predict/forecast` still validates `{ region, crimeType, horizon }` while the SPA sends `{ district, crime_type, window_days }` — body-field mapping is Step 5.
4. `POST /export/pdf` returns JSON, not a PDF; the SPA requests `responseType: 'blob'` and so receives a JSON blob. `role`/`scope`/`filters`/`title` are accepted and audited but do not shape the output (Phase 3, audit §7.12).

## Decision-#2 checkpoint (pre-Step-5) ✅ answered

**Question:** does `build_network_dataset/main.py` already provide a centrality measure?

**Answer: no — neither Python graph job computes any centrality.** Per the pre-agreed rule, **degree centrality**, computed in Node.

- `build_network_dataset/main.py` — raw co-accused pairs, one `offenderlinks` row per pair *per case* (`edgeid, sourceid, targetid, casemasterid`). No node-level metric.
- `graphNetworks/main.py` — aggregates the same pairs across cases (`edge_counts[(a,b)] += 1`) and writes `sourceid, targetid, casescount, relationshipstrength` (HIGH at ≥2 shared cases). That is an **edge weight**, not node centrality.

Three findings that support the "Node is authoritative, delete the Python duplicates" decision:
1. The two jobs write **incompatible column sets to the same `offenderlinks` table** — one writes `edgeid`/`casemasterid`, the other `casescount`/`relationshipstrength`. Running both leaves every row half-NULL with each relationship represented twice.
2. **Neither is idempotent** — both `INSERT` without clearing, and `build_network_dataset` restarts `edgeid` at 1 each run, so ids collide across runs.
3. `graphNetworks` rebuilds and prints a 10-item sample of `case_members` **inside** its per-row loop, and `multi_cases` is reset each iteration so its count is meaningless. On real data that is the dominant cost.

Worth keeping: `graphNetworks`'s co-occurrence count is a good edge weight, and the frontend's `NetworkEdge` already expects `weight`. Noted as follow-up — see "deferred" below.

## Step 5 — Contract reconciliation ✅ done (verified, automated)

### 5a. The graph and profile services could not read the Data Store at all

Four stacked defects, each masking the next. Together they meant the network graph returned nothing regardless of database contents — the audit saw only the symptom.

1. **`catalystApp` dropped before every read.** Callers use the legacy 2-arg form; the arg-shifting shims in `datastoreService`/`relationshipService` set `catalystApp = null` and `executeQuery` ran `null.zcql()`. The calling adapter swallowed the `TypeError` and returned `null`/`[]`. Fixed at the four chokepoints where the data layer touches the app object (`zcql()` in `executeQuery`; `datastore()` in insert/update/deleteRow) via a new request-scoped `services/catalystContext.js` built on `AsyncLocalStorage`, bound once in the Catalyst init middleware. An explicitly passed app still wins.
   *Not* a module-level singleton: `catalyst.initialize(req)` returns a per-request app carrying the caller's identity, so a shared `let currentApp` could hand one user's identity to another's request in a warm container — privilege escalation in a system built on role-gated PII.
2. **`buildGlobalNetworkGraph` seeded with `ROWID`** while `traverseCase` resolves cases by the business key (`casemasterid`). Every seed missed → the global graph was empty on every call. Introduced in Step 4.
3. **`expandRelationships` called `expandRecord` with mismatched arity.** Its signature is `(catalystApp, table, record, depth, maxDepth)` with no shim, so `(tableName, record, relationKeys)` bound `table` to the record and `record` to the relationKeys array; the `!relationConfig` guard then returned the **relationKeys array** as the "expanded record", making every downstream `expanded.unitId` read undefined.
4. **Double `isVisited()` checks — the one that kept the graph at a single node.** `isVisited` is test-**and-set**. Three sites pre-checked it immediately before calling a traversal function that runs the same guard: `traverseCase → traverseAccused`, `traverseVictim → traverseAccused`, and the `buildAccusedGraph` frontier → `traverseCase`. The caller consumed the mark, so the callee always saw "already visited" and returned. **The accused branch never executed once.** Removed the three redundant pre-checks; the two remaining `isVisited` sites (victim, transaction) build nodes inline with no self-guarding callee, so their check is the sole guard and is correct.

Also: the graph's `getRecordById` adapter now accepts either a business key or a `ROWID`, since `recordId()` prefers `ROWID` while lookups resolve business keys.

### 5b. Response / request contracts

| Endpoint | Was | Now |
|---|---|---|
| `GET /graph/network` | nodes `{id,type,label,data}`, edges `{id,source,target,label}` | nodes add **`name`** and **`centrality`** (degree, normalized 0..1 by `n-1`) plus `degree`; edges add **`weight`**. `label` retained for the existing React Flow consumers. |
| `POST /predict/forecast` | schema required `{region, crimeType, horizon}` → a real SPA call **400'd before reaching QuickML** | accepts `{district, crime_type, window_days}` (§8) with the old names as aliases; responds `{district, crimeType, windowDays, predictedCount, predictions, modelId, generatedAt}`. `predictedCount` is extracted defensively from several plausible QuickML shapes and is **`null`, never a misleading `0`**, when nothing numeric is found — the model's output shape is not pinned down anywhere in this repo. |
| `GET /auth/role` | `{zuid, email, …}` | adds **`user_id`** (§8 / frontend `resolveRole`); `zuid` kept as an alias since `authMiddleware` and `CONVERSATION_LOG` key off it. |
| `GET /conversation/:sessionId` | raw `CONVERSATION_LOG` rows; **404 for every real session** | `auditService.log` now forwards the caller's `threadId` (it previously dropped it, so `logConversation` minted a random `THREAD_ID` and nothing was ever keyed by the SPA's `session_id`), `queryController` passes `session_id`, and the route returns `{session_id, turns:[{role,text,timestamp}]}` — one log row expands into a user turn plus an assistant turn. |

### Verification ✅ `node scratch/verify_graph_traversal.mjs` → ALL PASS (exit 0)

New harness. Unlike `verify_rbac_matrix.mjs`, which stubs ZCQL to return `[]` (making a broken traversal and a correct-but-dataless one indistinguishable), it serves real fixture rows and asserts the **expanded shape**: ≥3 nodes, both accused present, ≥2 edges, every node carrying `id`/`type`/`name`/`centrality`, every edge carrying `source`/`target`/`weight`, centrality normalized and non-zero where connected, both halves of the conversation linkage, and both the accept and reject paths on the forecast body. It impersonates different roles per route because `/graph/*` is Investigator-only while `/predict/forecast` is Analyst-only.

Result on the 1-case/2-accused fixture: **200 with 3 nodes / 2 edges** on both graph routes, up from **404 with 0 nodes**. `RBAC matrix re-run: ALL PASS` after every change.

Two lessons applied to the harness itself: an assertion of `nodes > 0` **passed while the accused branch was completely dead**, and the stub's missing `insertRow` plus a lowercased result-envelope key were hiding the conversation path entirely. An assertion loose enough to pass a broken system is not a test.

### Deferred out of Step 5 (needs a decision, not more code)

- **Graph topology vs the frontend typedef.** `networkService.js` declares `NetworkNode.type` as `'accused'|'location'` and describes a co-accused network, but the traversal emits a heterogeneous graph (case, victim, accused, unit, district, court, chargeSheet, arrest, transaction…). Step 5 aligned the **field names**; it did not restructure the topology, which is a product decision. Doing so would also let `weight` carry the real shared-case count that `graphNetworks/main.py` computed, instead of the current constant 1.
- **`POST /export/pdf`** still returns JSON rather than a PDF — Phase 3 per the audit, and it needs a SmartBrowz template decision.

## Step 6 — Remove the duplicate Python half ✅ done

Scope per decision #1 (Node is authoritative). **Scope corrected: 7 functions removed, not the 12 named in the earlier draft of this section.** Checking each one against the Node surface showed 5 of the 12 are not duplicates at all, and deleting them would have destroyed capability rather than redundancy.

**Removed (7) — Node already serves the same feature:**

| Function | Reads | Writes | Superseded by |
|---|---|---|---|
| `mapHotspot` | `casemaster` | `hotspot_clusters` | `mapService` (recomputes from raw case rows) |
| `build_hotspot_dataset` | `casemaster` | `hotspot_clusters` | ditto — output never read |
| `graphNetworks` | `accused` | `offenderlinks` | `networkGraphService` (in-process traversal) |
| `build_network_dataset` | `accused` | `offenderlinks` | ditto — output never read |
| `predictforecast` | — | QuickML | `forecastService` calls QuickML directly |
| `profilebehavioral` | `accused`, `offenderprofiles` | — | `behaviouralProfileService` |
| `build_behavioral_dataset` | `accused` | `behavioral_clusters` | ditto — output never read |

`behavioral_clusters` is a **fourth** write-only dead table; the earlier draft listed only three.

**Retained (5) — not duplicates:**

- `build_forecast_results` + `predictexplain` — together the only implementation of `POST /predict/explain`, which Node does not have (Phase 2). `predictexplain` reads `forecast_results`, which `build_forecast_results` populates from `earlywarnings`, so the pair lives or dies together. This is why `forecast_results` must **not** be dropped, contrary to the earlier draft.
- `build_case_documents` + `generate_embeddings` + `search_documents` — a local RAG over `crimedocuments`. `ragService` posts to an external `${RAG_ENDPOINT}/v1/rag/query` instead, so this is a redundant second *implementation of RAG*, not a duplicate of a Node function. Retained through Step 6, but see the finding below: **the search half is provably broken and should be deleted.**

### Post-Step-6 finding: the local RAG search half cannot work ⏸ your call

Found while checking the survivors' `requirements.txt` against their imports — `generate_embeddings` lists `numpy` but imports only `hashlib`.

1. **`generate_embeddings/main.py` raises `NameError` at import time.** Lines 5–7 compute `hashlib.sha256(text.encode()).hexdigest()` at *module scope*, where `text` is not yet defined — it only exists inside the loop in `handler`. Catalyst imports `main.py` to locate `handler`, so the function fails before the handler runs. Proven by executing the module with `zcatalyst_sdk` stubbed: `NameError: name 'text' is not defined`. This function has never been able to execute.
2. **The two halves are type-incompatible even if repaired.** It writes `json.dumps(sha256_hexdigest)` — a 64-char *string*, not a vector. `search_documents` does `np.array(json.loads(doc["embedding"]))`, producing a 0-d `<U64` array, and `np.dot` on that raises `TypeError`. A hash is also not a semantic embedding, so cosine against a real MiniLM query vector is meaningless in principle, not just in type.

⇒ `crimedocuments.embedding` is NULL or garbage and `search_documents` cannot return a result. **Recommendation: delete `generate_embeddings` and `search_documents`; keep `build_case_documents`**, which works and produces exactly the corpus an external vector store needs. Deleting them also drops `sentence-transformers` (~2 GB with torch), the largest deploy-size and cold-start risk in the project.

Not done: the finding postdates the agreed Step 6 scope, and the attempted deletion was blocked by the permission classifier — correctly, since a second scope call belongs to you. `build_case_documents` is deliberately excluded from the recommendation.

**Safety before deleting:** grepped all 12 names across `scrb-backend` and `frontend/src`. Three hits, all benign — `mapHotspots` in the SPA is a JS identifier for the `/map/hotspots` path (substring collision), and the two backend hits are comments in `networkGraphService.js`. Nothing invokes a Catalyst function. Everything removed is recoverable from the baseline commit (`git show 6723510:functions/<name>/main.py`).

Also removed the orphaned `functions/predictforecast/.env` — untracked, so it survived `git rm` and left an empty directory. The same `QUICKML_ENDPOINT_URL`/`KEY` pair remains in `predictexplain/.env`, so no value was lost. That key still needs rotating.

`catalyst.json` targets 13 → 6. Both harnesses re-run after the deletions: **ALL PASS, exit 0.**

> `catalyst deploy` uploads but does not prune — the 7 functions stay deployed until removed in the console, and 4 of the 8 existing gateway rules now point at functions that no longer exist. Both are console items; see `DEPLOY.md` §1.2–1.3.

## Post-step deploy work (outside the numbered plan) ✅ done

**Frontend `catalyst.json` was silently broken.** It declared `{"command":{"client":{"source":"dist"}}}`. Verified against the installed CLI (v1.27.0): `util_modules/config/lib/client.js:26` returns `config.get('client')` — **top level** — and `source()` falls back to `folder_names.client` = `"client"`, a directory that does not exist in the frontend repo. `command` belongs to the AppSail config shape (`config/lib/appsail.js:87`), not the client one. So the client deploy would have resolved the wrong source path. Moved to top level, added a `node_modules/` ignore.

Everything else about client hosting was already correct and is now confirmed in the built output: relative `./assets/…` base, `axios.create({baseURL:'/api'})` baked in, `HashRouter`, `client-package.json` with `homepage`/`404` → `index.html`, and `postbuild` writing `dist/404.html`. Build green in 533 ms.

**Frontend source committed.** The repo tracked 4 files; the other 139 — including all of `src/` — were untracked. No secrets staged (`.env*` and `.catalystrc` remain ignored); the only credential-shaped strings are the intentional `demo123` logins in `LoginPage.jsx`/`roles.js`, i.e. the fake-login gap itself.

**`scrb-backend/.env` audited:** all 7 real values (`RAG_*` ×4, `QUICKML_*` ×3) are **present but empty**. Chat 500s and forecast throws until they are filled. Values were never printed — only key names and emptiness were checked.

## Still open (all require you, or a product decision)

1. **Console, blocking** — the `ANY /api/{path:(.*)}` → `/server/scrb-backend/{path}` gateway rule; delete the 8 stale/unauthenticated rules; delete the 7 removed functions; enable Catalyst Authentication; create and seed `UserRoles`; fill `scrb-backend/.env`; rotate the QuickML key. `DEPLOY.md` §1–2.
2. **SPA auth wiring** — `LoginPage.jsx` contacts no auth provider, so real Catalyst Auth yields 401 on every call. Deliberately deferred: untestable until Auth is enabled and the SPA is hosted on the project origin. `DEPLOY.md` §6.
3. **Graph topology** — product decision; also the prerequisite for a real co-occurrence `weight`.
4. **`POST /export/pdf`** — returns JSON, not a PDF. Needs a SmartBrowz template decision.

## Post-Step-6: roles moved to the Catalyst session ✅ done

You configured the three SCRB roles natively in the console (Authentication → Manage Application Users → Roles) with three invited users. The backend was querying a *different* mechanism — a custom `UserRoles` Data Store table keyed by ZUID — so as configured, every guarded route would have 403'd with "No SCRB role assigned".

Rather than have you duplicate the mapping into a table, the backend now reads the role off the session. `ICatalystUser` carries it: `role_details: { role_id, role_name }`, confirmed in the SDK's own typings (`zcatalyst-sdk-node/lib/utils/pojo/common.d.ts:131`). One source of truth — the console — instead of two that can drift.

| File | Change |
|---|---|
| `middlewares/authMiddleware.js` | sets `req.user.role` from `role_details.role_name` (plus `rawRole` for diagnostics) |
| `middlewares/roleMiddleware.js` | reads `req.user.role`; the ZCQL lookup is gone |
| `services/authService.js` | `getCurrentUserProfile` reads the session; `getRoleForUser` delegates to it; `assignUserRole` → 501 |
| `utils/constants.js` | `USER_ROLES` removed; `normalizeRoleName()` added; `HTTP_STATUS.NOT_IMPLEMENTED` added |

`normalizeRoleName` matches case- and separator-insensitively, so a console role typed `policymaker`, `POLICY_MAKER`, or `Policy Maker` still resolves. Anything unrecognised — including Catalyst's built-in `App User`/`App Administrator` — resolves to null and produces a 403 that **names the offending role and points at the console**, because otherwise a misconfigured role looks identical to a broken deploy.

**Second bug found in passing: `user_id` and `zuid` are different fields**, not aliases — visibly distinct columns in the console user list (e.g. `5465…262016` vs `50044353296`). Both `authMiddleware` and `authService` set `zuid = user_id`. It was self-consistent, so nothing observably broke (audit rows were written and compared with the same value), but `CONVERSATION_LOG.ZUID` held the wrong identifier. Both are now surfaced separately. Nothing is deployed, so there is no data to migrate.

`assignUserRole` now throws 501 instead of inserting into `UserRoles`. Writing there would have reported success while changing no permission — a silent no-op is worse than an explicit refusal. Implementing it properly needs `updateUserDetails(id, { role_id })` plus a name→id map for the project's roles. No frontend surface calls it.

### Verification ✅ 12 new checks in `verify_rbac_matrix.mjs`, ALL PASS

The existing role matrix would have passed whether or not normalization worked — it only ever fed canonical role names. The new block covers what it could not see: four spelling variants resolve; a resolved Policymaker is still refused the Analyst-only forecast (proving it mapped to the *right* role, not merely to something non-null); both built-in roles and the no-role case are refused; the 403 names the raw role; `/auth/role` still answers `role: null` for an unmapped user; and **no ZCQL query mentions `UserRoles`** (45 queries, 0 matches).

Those checks caught a wrong expectation of my own: I asserted `/auth/role` would 403 for an unmapped role. It is `authMiddleware`-only **by design** — the SPA calls it to *discover* its role, so gating it on already having a valid role is circular. Retargeted the refusal probes at `/alerts/active`, which is role-gated. The code was right; the test was wrong.

`verify_graph_traversal.mjs` re-run: ALL PASS.

## Post-Step-6: the SPA now uses real Catalyst Authentication ✅ done

Committed to the **frontend** repo (`9867b2a`), the last code item before deploy. Decisions from you: Catalyst's **hosted login page** (not the embedded SDK), and the `/api` gateway rule **locked to Catalyst User Management**.

The mock login matched a typed password against a hardcoded array in `src/utils/roles.js` and set React state — no network call, no session, and **the user picked their own role**, which made every role gate decorative.

### Mechanism, read out of the installed CLI rather than assumed

- **The session is a cookie, not a token.** The gateway validates via `GET /baas/{projectId}/check-auth`, reading `ZD_CSRF_TOKEN` plus the Zoho IAM cookies (`express_middlewares/auth-checker.js:42`). Accepted auth types are `APIKey | OAuth | CatalystUserManagement` (`apig-utils.d.ts:3`).
- **The SPA is served at `/app/*`** — confirmed against the live domain, whose root 302s to `/app/`. The API is at `/api/*` on the same domain, so the browser attaches the session itself. `withCredentials` is deliberately **not** set: it governs cross-origin only, and enabling it would force the backend off allow-all CORS for no benefit.
- **Post-login landing is configuration.** `client-package.json`'s `login_redirect` drives the `catalyst_default_signin_redirect` gateway rule (`client-utils.js:78,89`; `apig-utils.js:67-71,139-143`). Also verified the CLI does **not** existence-check `homepage` — only that it differs from `404` (`client-utils.js:67`) — so pointing it at `/__catalyst/auth/login` passes validation.

### Changes

| File | Change |
|---|---|
| `public/client-package.json` | `homepage` → `/__catalyst/auth/login` (hosted page becomes the entry point); `login_redirect` → `index.html` |
| `context/AuthContext.jsx` | no `login()`; bootstraps from `GET /auth/role` into `loading` / `signed-in` / `no-role` / `signed-out` |
| `pages/LoginPage.jsx` | no credential form, no role picker; renders the unrecoverable states, naming the console path an admin must fix |
| `api/services/authService.js` | token plumbing deleted; `resolveRole()` distinguishes the three outcomes; `signIn()` navigates to `/` rather than hardcoding the auth path |
| `api/apiClient.js` | dropped the `X-Auth-Token`/`X-User-Id` interceptor — the backend never read those, and a client-controlled header must never decide identity |
| `App.jsx` | `RequireAuth` waits for the session check instead of flashing login and losing the deep link |
| `utils/roles.js` | `DUMMY_CREDENTIALS` removed; `normalizeRole()` added |

A non-401 failure is **not** treated as signed-out — otherwise a backend outage bounces the user into a sign-in loop instead of showing an error.

### A live bug found in passing

The SPA's `ROLES` keys are **lowercase** (`'investigator'`) and every gate — `ROLE_PERMISSIONS`, `roleCan`, `RequireRole`, `ROLE_COLOR_VAR` — looks them up by that exact string. `GET /auth/role` returns the console's `'Investigator'`. `AuthContext` overwrote the local role with the API's value, so `roleCan()` would have missed on **every** feature: sign in succeeds, the app renders empty, no error. It never fired only because the endpoint was unreachable. Normalized at the boundary.

### Verification ✅ `node scripts/check-role-mapping.mjs` → 20 checks, exit 0

Covers the capitalisation the backend really sends, spelling tolerance, rejection of Catalyst's built-in `App User`/`App Administrator`, and asserts **both** that the raw value fails to gate and that the normalized one succeeds — so the regression cannot return silently. oxlint clean; build green; the shipped bundle no longer contains `demo123`, `X-Auth-Token`, `X-User-Id` or `token-u001`.

**One value I could not verify offline:** `homepage: "/__catalyst/auth/login"`. Nothing was deployed, so every probe 404'd. Confirm against the console or the client URL the CLI prints after deploy; it is the only place that path appears, since the SPA navigates to `/` on 401 and lets Catalyst redirect.
