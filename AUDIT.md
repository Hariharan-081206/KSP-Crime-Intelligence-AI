# SCRB Crime Intelligence — Pre-Deploy Full Repo Audit

**Scope:** `C:\Users\arjun\Desktop\SCRB\FE-Deploy` (frontend + backend) · **Date:** 2026-07-24
**Mode:** Read-only diagnostic. No source files were modified. The only files created are this `AUDIT.md` and a fresh `dist/` from the required `npm run build`.
**Verdict:** **NO-GO for a functional deploy.** The static frontend builds and can be *hosted*, but the frontend and backend were built to **two different API contracts** — of 20 frontend endpoints, **0 line up cleanly** with the backend. A live secret is sitting in the deploy tree. Details below.

---

## 0. Orientation notes (read before the findings)

**Spec of record is not in this repo.** The task template refers to `SCRB_Stage2_Zoho_Catalyst_Implementation.md` (§5/§7/§8). That file **does not exist anywhere on disk** — confirmed by `find`. The prior pass (`frontend/PRE_DEPLOY_REPORT.md:6`) already reconciled this to the sibling `..\..\Crime_intelligence_portal\proj_contxt.md` (exists, 45 KB) plus `Crime_intelligence_portal\CLAUDE.md`. I grounded spec-section references against that sibling doc and the frontend's own `endpoints.js` header comments (which say the paths are "derived from the Stage 2 doc Section 8").

**`CLAUDE.md` / `FEATURES.md` are not in this repo either** (only in the sibling `Crime_intelligence_portal\`). So the Phase-0 "list every stale CLAUDE.md claim" is answered against **stale references embedded in this repo's code comments**, not a local CLAUDE.md — see [P2-2].

**This is not a git repository.** `FE-Deploy\` has no `.git`. Only `frontend\.git` exists (frontend is its own repo); `backend\` is untracked. Consequence: the prompt's `git log --all -- '**/.env'` is **not runnable for the backend** — see [P0-2] for how the secret exposure was assessed instead.

**Prior work exists and is largely accurate** (`frontend/PRE_DEPLOY_REPORT.md`). Its frontend-only conclusions (clean build, no silent fixtures, RBAC gated in UI, code-split bundle) still hold. Where it says backend endpoints are "not built yet / degrade gracefully," this audit finds the sharper truth: **the backend IS built — just at entirely different paths** than the frontend calls. Every "⚠️ backend pending" row in that report is actually a **contract mismatch**, not a missing backend.

**Compat check (Phase 0 requirement) — ran, output reported.** `node scripts/catalyst-compat-check.mjs http://localhost:9999` executed cleanly and returned `Reachable: 0/20 · Network/CORS: 20` (all NETWORK) — expected with no live backend. It only *classifies HTTP status*; it **cannot detect the path/shape drift** documented here (a 400/500 from a mismatched-body route is scored `EXISTS` = "compatible"). Meaningful run requires a deployed URL: `node scripts/catalyst-compat-check.mjs <BASE_URL> <token>`.

**Build (Phase 3 requirement) — ran, green.** `npm run build` → `✓ built in 919ms`, 2021 modules, **no warnings, no chunk > 500 kB**. Postbuild emitted `dist/404.html`. Bundle detail in §4.

**Real component inventory** (`frontend/src/components/**`, all folders enumerated):
`alerts/` AlertCard, AlertsList · `audit/` AggregateStats, AuditLogList, ThresholdEditor · `case/` CaseRecordDrawer, CaseSummaryPanel, InvestigationTimeline, LeadSuggestions, SimilarCasesList · `chat/` BotMessage, ChatHeader, ChatInput, ChatWindow, IntentBadge, RightPanel, TypingIndicator, UserMessage · `common/` AnimatedNumber, ExportButton, GlobalToast, PanelHeader, RequireRole, RoleGate · `forecast/` ForecastPanel · `graph/` NetworkGraph, NetworkLegend, NodeInfoPanel, cytoscapeStyles · `layout/` AppShell, InvestigationBar, Sidebar, TopBar · `map/` CrimeMap, DistrictDetailCard, DistrictOutlines, HeatmapLayer, HotspotMarkers, MapLegend, StateMask, mapGeometry · `profile/` BehavioralProfile · `reasoning/` ReasoningTrace. **No `ChoroplethLayer.jsx`** (absent — consistent with prior report). All five components the task worried about (`ForecastPanel`, `ReasoningTrace`, `SimilarCasesList`, `LeadSuggestions`, `InvestigationTimeline`) **exist** → those doc rows are **TRUE**.

---

## 1. Executive summary (deploy-blocking only)

1. **Frontend↔backend contract is broken end-to-end.** `frontend/src/api/endpoints.js` targets a REST surface (`/auth/role`, `/graph/network`, `/predict/forecast`, `/profile/behavioral`, `/insights/demographic`, `/conversation/:id`, `/case/:id/*`, `/audit/*`, `/voice/*`) that the deployed Node function **does not expose**. The backend serves a *different* surface (`/auth/me`, `/graph/network/:caseId`, `/forecast`, `/behaviour/*`, `/history/*`, `/report/*`, `/alerts`). **0 of 20 endpoints work as-is.** [P0-1]
2. **A live secret is in the deploy tree.** `backend/functions/predictforecast/.env` and `.../predictexplain/.env` contain a real `QUICKML_ENDPOINT_KEY` and an endpoint URL embedding the project ID. No `.gitignore` protects them. **Rotate the key before anything ships.** [P0-2]
3. **The chat driver (the demo's spine) fails on contract.** FE `POST /query` sends `{query, session_id}`; backend `validateRequest` **requires `question`** → hard 400. Even if it passed, FE reads `data.answer` but backend returns `{success, data:{answer}}`. [P0-3]
4. **The one "matching" path returns unusable data.** `/map/hotspots` path matches, but backend returns `{district, crimeCount, latitude, longitude}` inside a `{success,data}` envelope; FE expects a bare array of `{id, lat, lng, label, severity}`. Map silently renders **empty**. Same class for `/map/district`. [P0-4]
5. **Network graph is doubly broken:** route needs `:caseId` (FE calls bare `/graph/network`), and the payload has **no `centrality` field at all** (not `centrality`, not `centrality_score`) and uses `label`/`data` instead of `name`. `NetworkGraphPage` reads `data.nodes` but would receive `data.data.nodes` → always "No network." [P0-5]
6. **RBAC is UI-only.** Every `authMiddleware`/`roleMiddleware` on data routes is **commented out** (`queryRoutes.js:14-15`, `forecastRoutes.js:14-15`, `mapRoutes`, `networkGraphRoutes`, `behaviouralProfileRoutes` — no guards at all). A direct call to `/graph/network/:id`, `/behaviour/profile/:id`, `/forecast` serves investigator/analyst data + PII to anyone. Spec §7.11/§7.16 require infra-level enforcement. [P1-1]
7. **Three routes are dead by construction:** `/report/*`, `/history/*`, `/export/:threadId` have `roleMiddleware` **active** but `authMiddleware` **commented**, so `req.user` is undefined → `roleMiddleware` returns 401 on every call (`roleMiddleware.js:39-43`). [P1-2]
8. **Python deps are under-declared** — `build_hotspot_dataset` (sklearn), `search_documents` (sentence-transformers), `predictforecast`/`predictexplain` (requests, python-dotenv) import packages **not in `requirements.txt`** → `ImportError` at runtime. `generate_embeddings/main.py` has a **module-level `NameError`** (uses `text` before it's defined). [P0-6]
9. **Deploy wiring is split and half-linked.** One Catalyst project ("Project-Rainfall", `54650000000013025`) is defined only in `backend/.catalystrc`; **`frontend/` has no `.catalystrc`**. `frontend/catalyst.json` (client) and `backend/catalyst.json` (functions) are two half-configs in sibling dirs. [P1-3]
10. **The `/api` base-URL convention is a trap.** `endpoints.js` assumes the base "already ends in `/api`", but the Node Express app mounts routes at root (`/query`, `/map`…), **no `/api` prefix** (`index.js:100-109`). Setting `VITE_API_BASE_URL=.../scrb-backend/api` (as the prior report's example does) 404s everything. [P1-4]

> **Not a blocker (cleared):** no silent fixture/fake-data path in production. The only fixture (`src/data/caseRecordFixture.js`) is dynamically imported **only** when `VITE_DEMO_MODE==='true'`, which is **absent from `.env.production`** → never loads in prod. This is the one thing the task worried most about, and it is clean.

---

## 2. Endpoint contract matrix (Phase 1)

Base: `apiClient.baseURL = VITE_API_BASE_URL || '/api'` (`apiClient.js:8`). Backend = the `scrb-backend` advanced-I/O Express function; all routes mounted at root in `index.js:100-109`. Catalyst function for **every** frontend call is `scrb-backend` (the frontend never invokes a Python function directly).

### 2a. Forward trace — every frontend method → what would serve it

| Frontend caller | `endpoints.js` path | Backend route file | Controller | Service | Status |
|---|---|---|---|---|---|
| `authService.resolveRole` | `GET /auth/role` | authRoutes.js (has `/me`, `/assign-role`) | authController.getCurrentUser | authService | **BROKEN — 404** (no `/auth/role`; backend uses `/auth/me`) |
| `queryService.postQuery` | `POST /query` | queryRoutes.js `POST /` | queryController.handleQuery | ragService/queryBuilder/datastore | **BROKEN — 400 body** (`query`≠required `question`) **+ shape** (`data.answer` nested) |
| `voiceService.speechToText` | `POST /voice/stt` | — | — | — | **MISSING — no `/voice` mount anywhere** |
| `voiceService.textToSpeech` | `POST /voice/tts` | — | — | — | **MISSING** |
| `networkService.getNetwork` | `GET /graph/network` | networkGraphRoutes.js `GET /network/:caseId` | networkGraphController.getFullNetworkGraph | networkGraphService | **BROKEN — 404** (bare path, route needs `:caseId`) **+ shape** (no `centrality`, `label`≠`name`, envelope) |
| `mapService.getDemographic` | `GET /insights/demographic` | — | — | — | **MISSING — no route, no controller** (confirmed suspect) |
| `mapService.getHotspots` | `GET /map/hotspots` | mapRoutes.js `GET /hotspots` | mapController.getCrimeHotspots | mapService | **DRIFTED — path OK, silent-empty** (`{district,crimeCount,latitude,longitude}` in `{success,data}` vs `[{id,lat,lng,label,severity}]`) |
| `mapService.getDistrictDetail` | `GET /map/district/:id` | mapRoutes.js `GET /district/:districtId` | mapController.getDistrictCrimes | mapService | **DRIFTED — path OK, shape wrong** (array of case rows vs `{districtName,totalIncidents,topCrimeTypes,…}`) |
| `profileService.getBehavioralProfile` | `GET /profile/behavioral` | behaviouralProfileRoutes.js `GET /profile/:accusedId` (mount `/behaviour`) | behaviouralProfileController | behaviouralProfileService | **BROKEN — 404** (wrong mount `/profile` vs `/behaviour`; needs `:accusedId`) |
| `predictService.runForecast` | `POST /predict/forecast` | forecastRoutes.js `POST /` (mount `/forecast`) | forecastController.getForecast | forecastService (QuickML) | **BROKEN — 404** (`/predict/forecast` vs `/forecast`) **+ body** (`district/crime_type/window_days` vs required `region/horizon`) |
| `predictService.explainForecast` | `POST /predict/explain` | — | — | — | **MISSING** (no Node route; Python `predictexplain` is a batch job, not HTTP-facing) |
| `alertsService.getActiveAlerts` | `GET /alerts/active` | alertsRoutes.js `GET /` (mount `/alerts`) | (inline) | datastoreService (`Alerts` table) | **BROKEN — 404** (`/alerts/active` vs `/alerts`) **+ shape/table** (`{success,data}`; queries non-existent `Alerts` table) |
| `conversationService.getConversation` | `GET /conversation/:sessionId` | historyRoutes.js `GET /:threadId` (mount `/history`) | (inline) | auditService | **BROKEN — 404** (`/conversation` vs `/history`) **+ dead** (see [P1-2]) |
| `exportService.exportPdf` | `POST /export/pdf` | exportRoutes.js `GET /:threadId` | (inline) | auditService/datastore | **BROKEN — 404/method** (no POST; GET returns JSON not a PDF blob) **+ dead** ([P1-2]) |
| `caseService.getCaseSummary` | `GET /case/:id/summary` | — | — | — | **MISSING — no `/case` mount** |
| `caseService.getSimilarCases` | `GET /case/:id/similar` | — | — | — | **MISSING** |
| `caseService.getCaseLeads` | `GET /case/:id/leads` | — | — | — | **MISSING** |
| `caseRecordService.getCaseRecord` | `GET /case/:id/record` | — | — | — | **MISSING** (known §5 P0; DB drawer) |
| `auditService.getAuditLog` | `GET /audit/log` | — | — | — | **MISSING — no `/audit` mount** |
| `auditService.saveThreshold` | `POST /audit/threshold` | — | — | — | **MISSING** |

**Tally:** 0 working · 3 path-matches all with body/shape drift (`/query`, `/map/hotspots`, `/map/district`) · 6 wrong path or wrong param (`/auth/role`, `/graph/network`, `/profile/behavioral`, `/predict/forecast`, `/alerts/active`, `/conversation`, `/export/pdf`) · 10 fully missing (`/voice/*`, `/insights/demographic`, `/predict/explain`, `/case/*`×4, `/audit/*`×2).

### 2b. Reverse trace — every backend route → is the frontend reaching it?

| Backend route (served) | Called by any FE service? |
|---|---|
| `GET /auth/me`, `POST /auth/assign-role` | **Orphaned** (FE calls `/auth/role`) |
| `POST /query`, `GET /query/:id` | `/query` reached but 400s; `/query/:id` **orphaned** |
| `GET /report/summary`, `GET /report/:threadId` | **Orphaned** + dead ([P1-2]) |
| `GET /map/crimes` `/map/case/:id` `/map/stations` `/map/heatmap` `/map/dashboard` | **Orphaned** (FE only uses hotspots + district) |
| `GET /map/hotspots`, `GET /map/district/:id` | Reached, drifted (see 2a) |
| `GET /graph/case/:id` `/graph/accused/:id` `/graph/transaction/:id` | **Orphaned** |
| `GET /graph/network/:caseId` | FE calls bare `/graph/network` → never matches |
| `GET /behaviour/profile/:id`, `POST /behaviour/query`, `POST /behaviour/generate` | **Orphaned** (FE calls `/profile/behavioral`) |
| `GET /alerts` | FE calls `/alerts/active` → 404 |
| `GET /export/:threadId` | **Orphaned** + dead |
| `POST /forecast` | **Orphaned** (FE calls `/predict/forecast`) |
| `GET /history`, `GET /history/:threadId` | **Orphaned** + dead |
| `GET /health` | (ops only) |

**Conclusion:** the two halves are almost entirely disjoint. This is not "a few paths to reconcile" — it is a **whole-surface reconciliation** (single-file `endpoints.js` edit **plus** per-endpoint body/response reshaping, or a backend router rename).

### 2c. Suspects — confirmed / cleared

- **`graphNetworks` (plural) / `mapHotspot` (singular) / lowercase `predictforecast|predictexplain|profilebehavioral`** vs camelCase spec §8 → **Confirmed spec-doc drift, but NOT a runtime break.** These are **Python basic-I/O batch jobs**, not the frontend's HTTP targets. The FE always hits the Node `scrb-backend`, never a Python function by name. Function names only matter for Cron/manual invocation (see below). `deployment.name` in each `catalyst-config.json` matches the folder name.
- **`insightsDemographic` / `/api/insights/demographic`** → **Confirmed: no backend route at all.** No `/insights` mount (`index.js:100-109`), no controller. Breakage: `CrimeMap` calls `getDemographic()` (`CrimeMap.jsx:15`), guards with `Array.isArray(demographic) ? … : demographic?.districts ?? []` (`CrimeMap.jsx:22`) → on any non-array it degrades to **empty heat**. `ChoroplethLayer.jsx` doesn't exist; the "choropleth" is the heat layer fed by demographic+hotspots, so it renders base map + outlines only. (Kills spec §7.5 socio-demographic view.)
- **`caseService.js` vs `caseRecordService.js`** → **Both live, non-duplicative.** `caseService` = Decision-Support panels (`/case/:id/summary|similar|leads`, used by `CaseDetailPage`); `caseRecordService` = the §5 raw-DB drawer (`/case/:id/record`, used by `CaseRecordDrawer`). Different endpoints, different consumers. Not a half-migration. (All four are MISSING on the backend.)
- **`exportRoutes.js` vs `reportRoutes.js`** → Overlapping intent, both orphaned. `exportService.js` (FE) hits **neither** — it POSTs `/export/pdf`; backend `exportRoutes` only serves `GET /export/:threadId` (JSON), and `reportRoutes` serves `GET /report/*`. FE export → 404.
- **`historyRoutes.js`** → serves `/history` + `/history/:threadId`; FE `conversationService` calls `/conversation/:session_id`. **Not wired.** Spec's `conversationThread`/`/api/conversation/{session_id}` is unimplemented at that path.
- **Pattern discovery (§7.3)** → **Cleared.** No `/pattern/discover` route, and the FE explicitly does **not** call it: `predictService.js:5` — "Hits /api/predict/forecast (NOT /api/pattern/discover, which is an internal orchestrator route)." Good.
- **Voice `voiceStt`/`voiceTts`** → **Confirmed unimplemented anywhere** — no Node route, no Python function folder. `useVoice`/`voiceService` will always fail (FE degrades silently per prior report).
- **`build_*` + `generate_embeddings` + `search_documents`** → **Confirmed batch/ETL, not public request handlers.** They write to Data Store (`INSERT INTO hotspot_clusters/forecast_results/offenderlinks/crimedocuments`) and take **no request body** (only `search_documents` reads `basicio.get_json_body()`). **Trigger mechanism: NONE found** — no Cron config, no `.build` trigger, no schedule anywhere in the repo (`find … -iname '*cron*'` empty). → They must be invoked **manually** from the Catalyst console today. Mark **NEEDS-VERIFICATION**: confirm intended Cron wiring.

### 2d. Cross-cutting contract drift (applies to every endpoint)

- **Response envelope.** Backend wraps everything as `{ success, message, data, …meta }` (`formatter.js:10`). Frontend services `return response.data` (the whole body) and hand it to consumers expecting the **inner payload**. Net effect ranges from silent-empty (map/network use `Array.isArray`/`?.nodes` guards) to wrong-text (chat).
- **Auth header scheme is stale.** `apiClient.js:33-36` attaches `X-Auth-Token: token-uXXX` + `X-User-Id` (a Flask-era dev scheme per `authService.js:5`). Backend `authMiddleware.js:24-25` ignores headers and uses `catalystApp.userManagement().getCurrentUser()` (real Catalyst Authentication). So when auth is eventually enabled, the FE's token header **won't authenticate** → 401. `X-Auth-Token: token-u001` is **no longer the scheme**; Catalyst Authentication is intended but disabled.
- **Two conflicting table schemas in the backend.** `graphConstants.js:9-55` + the Python jobs use the **real** lowercase tables (`casemaster`, `accused`, `earlywarnings`, `forecast_results`…). But `utils/constants.js:28-35` (used by `roleMiddleware`, alerts route) references `UserRoles`, `Alerts`, `CrimeRecords`, `CaseFiles` — a different, likely-nonexistent schema. Role resolution (`roleMiddleware.js:17` `SELECT ROLE_NAME FROM UserRoles`) and `/alerts` (`Alerts` table) will fail against the actual DB.
- **External deps unset even for the backend's own happy path.** The self-test logged `RAG_ENDPOINT or RAG_API_KEY is not set` and `QUICKML_FORECAST_MODEL_ID is not set` — so `/query` answer-generation and `/forecast` need external config that isn't present.

---

## 3. Findings

### [P0-1] Frontend and backend implement two different API contracts
Category: broken
Evidence: `frontend/src/api/endpoints.js:7-43` (e.g. `graphNetwork: '/graph/network'`, `profileBehavioral: '/profile/behavioral'`, `predictForecast: '/predict/forecast'`, `insightsDemographic: '/insights/demographic'`) vs `backend/functions/scrb-backend/index.js:100-109`:
```js
app.use('/auth', authRoutes);      app.use('/query', queryRoutes);
app.use('/report', reportRoutes);  app.use('/map', mapRoutes);
app.use('/graph', networkGraphRoutes); app.use('/behaviour', behaviouralProfileRoutes);
app.use('/alerts', alertsRoutes);  app.use('/export', exportRoutes);
app.use('/forecast', forecastRoutes); app.use('/history', historyRoutes);
```
Impact: 0/20 endpoints resolve (matrix §2a). Kills every live-data feature: chat, map, network, forecast, profile, alerts, audit, case support, export. This is the deploy blocker; a hosted frontend would show loading→error/empty on every panel.
Proposed fix: pick ONE contract and converge. Lowest-blast-radius = rewrite `endpoints.js` paths to the backend's actual routes **and** add per-endpoint request/response adapters in `src/api/services/*` (unwrap `.data`, remap fields, add `:caseId`/`:accusedId` path params, rename `query→question`, `district→region`, etc.). Higher-fidelity = rename backend routers + add the missing routes (`/voice`, `/insights/demographic`, `/predict/explain`, `/case/*`, `/audit/*`) to match the spec §8 surface the FE already targets.
Blast radius: all 14 `src/api/services/*.js` + `endpoints.js`, or all 10 backend `routes/*.js` + several controllers/services. This is the central decision — see Open Questions.

### [P0-2] Live QuickML secret committed in the deploy tree
Category: broken (security)
Evidence: `backend/functions/predictforecast/.env` and `backend/functions/predictexplain/.env` each define **`QUICKML_ENDPOINT_URL`** (a real `https://api.catalyst.zoho.in/quickml/v1/project/54650000000013025/endpoints/predict` URL embedding the project ID) and **`QUICKML_ENDPOINT_KEY`** (a real 40+ char key). No `.gitignore` exists anywhere under `backend/`. *(Value not reproduced here per handling rules; it was briefly surfaced during a redaction miss on my side — treat it as compromised.)*
Impact: anyone with the tree (these two functions shipped inside `frontend.zip`/`neww scrb gemini.zip` at repo root) has a working QuickML endpoint key. Not a git-history problem (backend isn't a git repo) — it's a **distribution** problem.
Proposed fix: (1) **rotate the QuickML endpoint key** in the Zoho console now. (2) Remove both `.env` files from the function dirs; move the values into each function's `catalyst-config.json` `env_variables` (currently `{}`) or Catalyst secrets. (3) Add a `backend/.gitignore` covering `.env`, `node_modules`, `.build`. (4) Delete the two root zip archives from the deploy tree.
Blast radius: 2 `.env` files, 2 `catalyst-config.json`, 1 new `.gitignore`; QuickML consumers (`predictforecast`, `predictexplain`).

### [P0-3] `/query` (chat) fails on request body and response shape
Category: broken
Evidence: FE sends `{ session_id, query, language, role }` (`queryService.js:22-27`). Backend requires `question`: `queryRoutes.js:16-20` `validateRequest({ body: { question: { required: true … } } })`, and `queryController.js:28` `const { question, filters } = req.body` → returns 400 when absent. Response is `{ success, data: { question, intent, answer, citations, … } }` (`queryController.js:187-195`) but FE reads top-level: `toBotMessage` uses `data?.text ?? data?.answer` (`ChatContext.jsx:22-27`) → `answer` is nested one level down → "No response text was returned."
Impact: the natural-language assistant — the product's spine and every demo's opening move (spec §7.1) — returns a hard error; `ChatContext.jsx:61` shows "could not reach the intelligence service." Cross-page reactivity (§4) never fires because `pushFromQueryResponse(data)` gets no `slots`.
Proposed fix: send `question` (map from `query`) and unwrap `res.data.data` in `queryService`; or accept `query` and return a flat body in `queryController`. Also have the backend return `slots:{case_id,accused_id,district}` and `reasoning` per the FE contract.
Blast radius: `queryService.js`, `ChatContext.jsx`, `queryController.js`, `parseInvestigationSlots.js` (regex fallback stays until slots land).

### [P0-4] `/map/hotspots` & `/map/district` return the wrong shape (silent-empty map)
Category: drifted
Evidence: `mapService.getCrimeHotspots` returns `[{ district, crimeCount, latitude, longitude }]` (`services/mapService.js:358-386`) inside the `{success,data}` envelope; FE `HotspotMarkers` maps `hotspot.lat/.lng/.severity/.label` and `hotspot.id` (`HotspotMarkers.jsx:13-25`), and `CrimeMap.jsx:17-20` does `Array.isArray(hotspots) ? hotspots : []` on the **envelope object** → not an array → `[]`. `getDistrictCrimes` returns an array of full case rows (`services/mapService.js:277-333`) but `getDistrictDetail`'s consumer expects `{ districtName, totalIncidents, topCrimeTypes, activeAlerts, forecastNext7d, … }` (`services/mapService.js` JSDoc + `DistrictDetailCard`).
Impact: even the endpoints whose *paths* match render **nothing** — no hotspot markers, blank district card (spec §7.3/§7.5/§7.7). Worse than an error because it looks "up" but empty. Note also the backend hotspots are per-district counts, not the DBSCAN clusters the spec/Python pipeline produce — see [P2-3].
Proposed fix: unwrap `.data` and reshape in `mapService` (FE) — emit `{id,lat,lng,label,severity}` and an aggregated district object; or change the backend controllers to return those shapes directly.
Blast radius: `src/api/services/mapService.js`, `HotspotMarkers.jsx`, `DistrictDetailCard.jsx`, backend `mapController`/`mapService`.

### [P0-5] Network graph: wrong route arity + missing `centrality` + wrong node shape
Category: broken + drifted
Evidence: FE calls `GET /graph/network` with **query** params (`networkService.js:29-31`, `NetworkGraphPage.jsx:14-16` build `{caseId, accusedId}`); backend route is `GET /graph/network/:caseId` (`networkGraphRoutes.js:42`) → bare path 404s. Payload: backend nodes are `{ id:`${type}_${id}`, type, label, data }` and edges `{ id, source, target, label }` (`networkGraphService.js:158-181`), wrapped in `{success,data:{nodes,edges,meta}}`. FE reads `node.name`, `node.centrality`, `edge.weight`, `edge.type` (`NetworkGraph.jsx:24-38`) and gates rendering on `data?.nodes?.length` (`NetworkGraphPage.jsx:22`) — which is `data.data.nodes` under the envelope. **There is no `centrality` field anywhere** in the backend output (neither `centrality` nor `centrality_score`) — the service never computes centrality.
Impact: investigator network graph (spec §7.4) shows "No network connections" permanently; if the route were fixed, nodes would be unlabeled and uniformly sized (no centrality scaling). The prompt's `centrality` vs `centrality_score` suspicion is real but understated — the field is simply **absent**.
Proposed fix: FE call `getNetwork` → `/graph/network/${caseId}`; unwrap `.data`; backend add a `centrality` score to each node and emit `name`/`weight`/`type` (or FE remap `label→name`). Decide whether financial-trail nodes stay (see [P1-5]).
Blast radius: `networkService.js`, `NetworkGraph.jsx`, `NetworkGraphPage.jsx`, backend `networkGraphService.js`.

### [P0-6] Python functions: under-declared deps + a module-level NameError
Category: broken
Evidence:
- `build_hotspot_dataset/main.py:4` `from sklearn.cluster import DBSCAN` — `requirements.txt` = `zcatalyst-sdk`, `numpy` only (**no scikit-learn**).
- `search_documents/main.py:4` `from sentence_transformers import SentenceTransformer` + `main.py:6` `SentenceTransformer("all-MiniLM-L6-v2")` at import — `requirements.txt` = `zcatalyst-sdk`, `numpy` only (**no sentence-transformers/torch**).
- `predictforecast/main.py:2,6` `import requests` / `from dotenv import load_dotenv` — `requirements.txt` = `zcatalyst-sdk` only.
- `predictexplain/main.py:3` `from dotenv import load_dotenv` — `requirements.txt` = `zcatalyst-sdk` only.
- `generate_embeddings/main.py:5-7` executes `embedding = hashlib.sha256(text.encode())…` at **module scope**, before `text` exists → `NameError` on import/cold-start.
Impact: each affected function crashes at deploy/cold-start or first run. If these ETL jobs are what populate `hotspot_clusters`/`forecast_results`/`crimedocuments`, the whole data pipeline behind the map/forecast/search features is broken.
Proposed fix: complete each `requirements.txt` (`scikit-learn`, `sentence-transformers`, `requests`, `python-dotenv`); delete the dead module-level lines in `generate_embeddings` (the real hashing happens inside `handler`). See [P1-6] for the heavy-ML sizing concern.
Blast radius: 5 `requirements.txt`, 1 `main.py`.

### [P0-7] Forecast function reads env vars that its `.env` doesn't define
Category: broken
Evidence: `predictforecast/main.py:10-11` `os.getenv("QUICKML_FORECAST_ENDPOINT_URL")` / `("QUICKML_FORECAST_ENDPOINT_KEY")`, but the `.env` defines `QUICKML_ENDPOINT_URL` / `QUICKML_ENDPOINT_KEY` (no `FORECAST_`). → both are `None` → `requests.post(None, headers={... : None})` raises.
Impact: `predictforecast` fails immediately even with the (leaked) key present — the forecast pipeline never runs.
Proposed fix: align the names (either add `FORECAST_` in `.env`/`env_variables`, or drop it in `main.py`). Fold into the [P0-2] secret-relocation change.
Blast radius: `predictforecast/main.py` or its env config.

### [P1-1] RBAC is enforced in the UI only; backend guards are commented out
Category: broken (security / spec §7.11, §7.16)
Evidence: guards are commented across data routes — `queryRoutes.js:14-15`, `forecastRoutes.js:14-15`, `authRoutes.js:16-17`, `alertsRoutes.js:23-24`; `mapRoutes.js`, `networkGraphRoutes.js`, `behaviouralProfileRoutes.js` add **no** auth/role middleware at all. Frontend gating is real but client-side: `App.jsx:66-72` `<RequireRole feature="network">` etc., `roles.js:14-20` `ROLE_PERMISSIONS`, `RoleGate.jsx`/`RequireRole.jsx`. PII masking is UI-only too (`NetworkGraph.jsx:24` `maskForRole(...)` carries a `TODO(security)`).
Impact: a direct call (curl/Postman) to `/graph/network/:caseId`, `/graph/accused/:id`, `/behaviour/profile/:accusedId`, `/forecast`, `/map/*` returns full data **regardless of role** — including the investigator-only criminal network + financial trail and behavioral PII. Spec requires enforcement at the infrastructure level, not just hidden UI. Per §5 matrix: investigator-only surfaces (network graph, financial trail, case detail) and analyst-only (forecast trigger, threshold edit) are all unprotected server-side.
Proposed fix: re-enable `authMiddleware` + `roleMiddleware` on every data route with the correct role lists; align role strings (`roleCan` uses `investigator`/`analyst`/`policymaker`; backend expects `Investigator`/`Analyst`/`Policymaker` from `constants.js:3-7`); back masking with server-side redaction.
Blast radius: all 10 `routes/*.js`, `roleMiddleware.js`, the `UserRoles` table assumption ([see §2d]).

### [P1-2] `/report/*`, `/history/*`, `/export/:threadId` are dead (401 on every call)
Category: broken
Evidence: these three keep `roleMiddleware` **active** while `authMiddleware` is **commented**: `reportRoutes.js:14-15,29`, `historyRoutes.js:18-19`, `exportRoutes.js:24-25`. `roleMiddleware` runs first-fails: `roleMiddleware.js:39-43` `if (!req.user) return errorResponse(401, 'authMiddleware must run before roleMiddleware')`. `req.user` is only set by `authMiddleware` (`authMiddleware.js:34`), which never runs. `/history` also reads `req.user.zuid` (`historyRoutes.js:25`) → would throw anyway.
Impact: report/history/export endpoints always 401. (They're orphaned from the FE too, so no *current* FE feature depends on them — but they're dead if anything is pointed at them.)
Proposed fix: uncomment `authMiddleware` on these three (and everywhere role runs), or remove the `roleMiddleware` until auth is wired.
Blast radius: 3 route files.

### [P1-3] Split, half-linked Catalyst project wiring
Category: drifted
Evidence: `backend/.catalystrc` defines one project — `"name": "Project-Rainfall"`, `"id": "54650000000013025"`. **`frontend/` has no `.catalystrc`** (only `frontend/catalyst.json` = `{ command.client.source: dist }`). `backend/catalyst.json` lists only `functions.targets` (13). The QuickML URL embeds the same project id `54650000000013025`, so it's a single project — but the two deploy configs live in sibling dirs and only the backend is linked.
Impact: `catalyst deploy --only client` from `frontend/` has no project binding; the two halves can't be deployed from one place. Also the project is named **"Project-Rainfall"**, not SCRB — likely a reused scratch project (verify it's the intended target).
Proposed fix: decide topology — either one project root with a combined `catalyst.json` (`client` + `functions`) and one `.catalystrc`, or `catalyst init`/link `frontend/` to the same project id. Confirm "Project-Rainfall" is the deploy target.
Blast radius: `catalyst.json`(s), `.catalystrc`.

### [P1-4] The `/api` base-URL convention doesn't match the backend mount
Category: drifted
Evidence: `endpoints.js:45-48` — "the base already ends in `/api`, so paths here are prefix-less"; `apiClient.js:8` `baseURL: VITE_API_BASE_URL || '/api'`. But the Express app mounts at **root** (`index.js:100-109`) — there is no `/api` router. The prior report's own example sets `VITE_API_BASE_URL=…/server/scrb-backend/api` (`PRE_DEPLOY_REPORT.md:251`), which would make every call `…/scrb-backend/api/query` → 404.
Impact: even after path reconciliation, a base URL ending in `/api` 404s everything; a base without `/api` is required (`…/server/scrb-backend`). Silent, easy-to-miss config trap at deploy time.
Proposed fix: set `VITE_API_BASE_URL` to the function root **without** `/api` (`https://<project>.<zone>.catalystserverless.com/server/scrb-backend`), or add an `/api` mount in `index.js`. Update the endpoints.js comment + prior report example.
Blast radius: `.env.production` value, `endpoints.js` comment.

### [P1-5] Backend network graph still emits the "removed" financial trail
Category: drifted
Evidence: the FE removed Financial Trail by design (`endpoints.js:5-6`, `networkService.js:21` "Financial/money-trail edges removed"; `PRE_DEPLOY_REPORT.md:50`). But `networkGraphService.js` still traverses and emits `bankAccount`/`transaction`/`alert` nodes (`traverseAccounts:568`, `traverseTransactions:594`, `traverseAlerts:633`) and `graphConstants.js:48-53` defines those tables/types.
Impact: if the network endpoint is wired up, the graph would surface financial-trail entities the product intentionally dropped — data/scope drift, and a potential exposure (financial data) the UI no longer expects to render.
Proposed fix: decide authoritative scope. If Financial Trail stays removed, strip those traversals from `networkGraphService`; if it returns, it's net-new FE scope, not a fix.
Blast radius: `networkGraphService.js`, `graphConstants.js`, `NetworkGraph.jsx` legend/styles.

### [P1-6] Heavy ML in basic-I/O functions → size / cold-start risk (belongs on AppSail)
Category: drifted (spec §3, §12)
Evidence: `search_documents/main.py` loads `sentence-transformers` (`all-MiniLM-L6-v2`, pulls in torch) at import; `build_hotspot_dataset/main.py` uses `scikit-learn` DBSCAN. These are `basicio` Python 3.11 functions (`catalyst-config.json`).
Impact: sentence-transformers+torch is hundreds of MB and multi-second cold starts — likely to blow basic-I/O package-size/cold-start limits. Spec §3/§12 route heavy ML to AppSail.
Proposed fix: move `search_documents` (and any transformer/torch/sklearn work) to AppSail or a QuickML endpoint; keep basic-I/O functions to light ZCQL ETL.
Blast radius: `search_documents`, `build_hotspot_dataset` deployment targets.

### [P2-1] `certifi-*.dist-info` cruft + committed `node_modules` in the deploy tree
Category: stale
Evidence: every Python function dir contains a bare `certifi-2026.6.17.dist-info/` (metadata only, no package) — partial/abandoned vendoring. `backend/functions/scrb-backend/node_modules/` is present in-tree. No `backend/.gitignore`.
Impact: Catalyst resolves Python `requirements.txt` and Node `package.json` at deploy — full vendoring is **not** required for this stack, so the `dist-info` dirs are dead weight and the committed `node_modules` is bloat. (`build_hotspot_dataset/` even has a stray `package-lock.json`.)
Proposed fix: delete the `certifi-*.dist-info` dirs and the stray `package-lock.json`; don't ship `node_modules` (add `backend/.gitignore`). Vendoring is unnecessary; `requirements.txt`/`package.json` are the mechanism.
Blast radius: cleanup only.

### [P2-2] Stale Flask/Supabase references embedded in code (the "stale CLAUDE.md" claims)
Category: stale
Evidence: `vite.config.js:16-22` dev proxy targets `http://localhost:5000` described as "the Flask backend"; `apiClient.js:5` "same-origin proxy for local dev"; `apiClient.js:16-18` + `authService.js:5-7` cite a "root CLAUDE.md" `X-Auth-Token: token-uXXX` dev scheme; `index.js:1` header comment `// File: backend/functions/query/index.js` (function is `scrb-backend`, not `query`). There is **no `CLAUDE.md` in this repo** to correct; these are the residual claims. The architecture is now Catalyst (Node advanced-I/O + Python) — no Flask/Supabase/Vercel.
Impact: misleads the next engineer on auth model and dev setup; the `localhost:5000` proxy points at a backend that no longer exists.
Proposed fix: update the comments to the Catalyst reality (Catalyst Authentication, `scrb-backend` function URL); either remove the dev proxy or point it at `catalyst serve`.
Blast radius: comments + `vite.config.js` proxy.

### [P2-3] Duplicated, disconnected feature logic (Node vs Python) — authority undefined
Category: stale/drifted
Evidence: **Forecast** exists in `services/forecastService.js` (QuickML SDK `model.predict`), `predictforecast/main.py` (QuickML REST → writes `forecast_results`), and `build_forecast_results/main.py` (reads `earlywarnings`). **Hotspots** in `services/mapService.js:338` (ad-hoc district counts), `build_hotspot_dataset/main.py` (DBSCAN → `hotspot_clusters`), and `mapHotspot/main.py` (rounded lat/lon). **Network** in `networkGraphService.js` (rich traversal), `build_network_dataset/main.py` + `graphNetworks/main.py` (co-accused `offenderlinks`). **Behavioral** in `behaviouralProfileService.js` vs `profilebehavioral/main.py` + `build_behavioral_dataset/main.py`. The API-serving Node layer does **not** read the tables the Python jobs populate (e.g. hotspots recomputed from `casemaster`, not read from `hotspot_clusters`).
Impact: three implementations per feature, none wired to each other; unclear which is authoritative → whichever ships, the DBSCAN/QuickML pipeline output may be ignored.
Proposed fix: declare the authoritative path per feature (recommended: Python jobs populate Data Store tables on a schedule; Node API reads those tables). Delete or clearly demote the rest.
Blast radius: architectural decision; touches map/forecast/network/behavioral services.

### [P2-4] Unused large assets in `src/assets/`
Category: stale
Evidence: `karnataka-districts.geojson` (6.68 MB) is unimported — `DistrictOutlines.jsx:9` imports `karnataka-districts.min.geojson` (2.83 MB) as `?url`. `karnataka-districts-simplified.json` (97 KB) is unused (wrong schema per prior report). Confirmed: only the `.min.geojson` is emitted to `dist/` (2.83 MB static asset, fetched on demand — **not** in the JS bundle).
Impact: 6.7 MB dead file in the repo (not in the bundle, so no TTI cost — a cleanliness/repo-size issue only). The 2.83 MB min file *is* fetched on the map route; acceptable but the single heaviest runtime asset.
Proposed fix: delete the full `.geojson` and `-simplified.json` from `src/assets/` once confirmed unreferenced; keep `.min.geojson` and `karnataka-outline.json`.
Blast radius: asset cleanup.

---

## 4. Deployment readiness checklist (Phase 3)

| Item | Verdict | Evidence / note |
|---|---|---|
| Same Catalyst project, front+back | **FAIL** | One project ("Project-Rainfall" `54650000000013025`) in `backend/.catalystrc`; `frontend/` unlinked, no `.catalystrc`. [P1-3] |
| `.catalystrc` scoped correctly | **FAIL** | Backend only; frontend missing. |
| `frontend/public/client-package.json` valid + name | **PASS** | Valid JSON; `name:"scrb-crime-intelligence"`, `homepage/404:index.html`, `version:1.1.0`; auto-copied to `dist/`. |
| Per-function `catalyst-config.json` (name/stack/main/type) | **PASS (config) / FAIL (runtime)** | `scrb-backend` node20 advancedio `index.js` ✓; 12 Python python_3_11 basicio `main.py` ✓; `deployment.name` matches folders. But `env_variables:{}` on forecast/explain while code needs QuickML vars → [P0-7]. |
| Entry-point matches actual file | **PASS** | `index.js` and all `main.py` exist. |
| Python `requirements.txt` covers imports | **FAIL** | Missing scikit-learn / sentence-transformers / requests / python-dotenv. [P0-6] |
| Full vendoring required? | **NO** (info) | Catalyst resolves `requirements.txt` at deploy; `certifi-*.dist-info` is cruft. [P2-1] |
| Heavy ML fits basic-I/O | **FAIL** | sentence-transformers/torch + sklearn → move to AppSail. [P1-6] |
| Node `node_modules`/`.build` handling | **FAIL** | `scrb-backend/node_modules` committed; no `backend/.gitignore`. (`backend/.build` not found in this tree.) [P2-1] |
| Secrets gitignored / never committed | **FAIL (P0)** | Live QuickML key in 2 `.env`; no backend `.gitignore`; backend not a git repo but shipped in root zips. **Rotate.** [P0-2] |
| Frontend build | **PASS** | `✓ built in 919ms`, 2021 modules, **no warnings, no chunk >500 kB**. Entry `index-*.js` 279.5 kB (gzip 87.5); lazy `NetworkGraph` 444 kB, `CrimeMap` 172 kB; `.min.geojson` 2.83 MB separate asset. `dist/404.html` emitted. |
| `vite.config.js` base path | **PASS** | `base:'./'` (`vite.config.js:11`). |
| `VITE_API_BASE_URL` resolves to real function URL | **VERIFY (FAIL-risk)** | `.env.production` key = `VITE_API_BASE_URL` (placeholder). Must be `…/server/scrb-backend` **without** `/api`. [P1-4] |
| Works only under `npm run dev`? | **NOTE** | Dev proxy → dead `localhost:5000` (Flask). Prod uses baked `VITE_API_BASE_URL`; fine, but proxy is stale. [P2-2] |
| Assets — which GeoJSON bundled | **PASS** | Only `.min.geojson` (2.83 MB) emitted; full 6.68 MB unimported/not bundled; `-simplified.json` unused. [P2-4] |
| CORS / origin | **NOTE (permissive)** | `index.js:29` `app.use(cors())` = allow-all. No CORS failures expected (contra prior report's worry), but should be restricted to the two Catalyst SPA origins before prod. |
| Backend self-test runnable | **VERIFY** | `scratch/test_api_endpoints.js` ran but every route 500s at `catalyst.initialize(req)` ("Failed to parse object") outside the Catalyst runtime; needs `catalyst serve` + project auth. It exercises the **backend's** routes (`/auth/me`, `/query` w/ `question`, `/map/*`, `/graph/*`, `/behaviour/*`, `/forecast`, `/history`) — it does **not** cover any of the frontend's actual paths except `/query`, `/map/hotspots`, `/map/district`. |
| Compat check | **VERIFY** | Runs; needs live `<BASE_URL>`. Classifies HTTP status only — will *not* catch the drift in this report. |
| No silent fixtures in prod | **PASS** | Only `caseRecordFixture.js`, gated by `VITE_DEMO_MODE` (absent in `.env.production`). |

---

## 5. Open questions for you

1. **Which contract wins — reshape the frontend, or rename/extend the backend?** [P0-1] This is the single biggest decision and drives blast radius. My recommendation: reshape the **frontend** `endpoints.js` + services to the backend's real routes for the endpoints that exist, and build the genuinely-missing routes (`/case/*`, `/insights/demographic`, `/predict/explain`, `/audit/*`, `/voice/*`) on the backend. But if the spec §8 surface is contractual, the backend rename is the "correct" fix.
2. **Is "Project-Rainfall" (`54650000000013025`) the intended deploy target,** and should frontend + backend live in **one** Catalyst project or two? [P1-3]
3. **Has the QuickML key already leaked beyond this machine** (the two root zips, shared drives, chat)? Regardless, I recommend rotating — confirm you want me to note it as rotated once done. [P0-2]
4. **What triggers the Python ETL jobs?** No Cron/schedule config exists in the repo. Are they meant to be Cron functions, or manually run once to seed Data Store? [§2c]
5. **Is Financial Trail truly out of scope?** The frontend removed it but `networkGraphService` still emits financial nodes. [P1-5]
6. **Authoritative implementation per feature** (Node API vs Python job vs QuickML) — especially forecast and hotspots, which each have 3 implementations. [P2-3]
7. **Auth model for the demo:** keep the disabled `X-Auth-Token` dev scheme, or wire real Catalyst Authentication (`getCurrentUser`) end-to-end? The frontend currently sends a header the backend ignores. [§2d]

---

*Stopping here per instructions — no fixes applied. On approval, I'll work P0 → P1 → P2, one logical change per commit, on a `chore/pre-deploy-audit` branch (needs `git init` first — this dir isn't a repo), re-running the compat check + `npm run build` after each batch.*
