# SCRB — Catalyst deployment runbook

Target project: **Project-Rainfall**, env **Development**. Both
`backend/.catalystrc` and `frontend/.catalystrc` bind to the same project id and
the same domain — verified, so **SPA and API share an origin** and no CORS or
cross-site cookie handling is needed.

Last updated after Step 6. Everything below has been checked against the tree,
not assumed.

---

## 0. Function inventory (6, was 13)

| Function | Stack | Type | Role |
|---|---|---|---|
| `scrb-backend` | Node 20 | Advanced I/O | The Express API. **Every** frontend call lands here. |
| `build_case_documents` → `generate_embeddings` → `search_documents` | Python 3.11 | Basic I/O | A self-contained local RAG over `crimedocuments`. **Not** on any request path. |
| `build_forecast_results` → `predictexplain` | Python 3.11 | Basic I/O | The only implementation of `POST /predict/explain`. **Not** on any request path. |

**Seven were deleted in Step 6** (`mapHotspot`, `build_hotspot_dataset`,
`graphNetworks`, `build_network_dataset`, `predictforecast`, `profilebehavioral`,
`build_behavioral_dataset`) — dead duplicates of features `scrb-backend` already
serves in Node. Nothing in the backend ever invoked a Catalyst function, verified
by grepping every outbound-call form; the only hit is `ragService.js:39`, an
external RAG endpoint. Recover any of them with
`git show 6723510:functions/<name>/main.py`.

The 5 surviving Python functions have **no HTTP caller and no Cron trigger.**
They are reachable only from the console or from a gateway rule. Two open
questions for you, neither of which blocks the deploy:

- **The local RAG trio — its search half is provably broken. Recommend deleting
  `generate_embeddings` and `search_documents`.** `scrb-backend` posts to
  `${RAG_ENDPOINT}/v1/rag/query`, so this trio is a second, independent RAG over
  the `crimedocuments` table. It cannot work, for two independent reasons:

  1. **`generate_embeddings/main.py` raises `NameError` at import time.** Lines
     5–7 compute `hashlib.sha256(text.encode())` at *module scope*, where `text`
     does not exist yet — it is only defined inside the loop in `handler`.
     Catalyst imports `main.py` to locate `handler`, so the function fails before
     the handler is ever called. Verified by executing the module with the SDK
     stubbed: `NameError: name 'text' is not defined`.
  2. **Even repaired, the two halves are type-incompatible.** It stores
     `json.dumps(sha256_hexdigest)` — a 64-character *string*, not a vector.
     `search_documents` then does `np.array(json.loads(embedding))`, yielding a
     0-d `<U64` string array, and `np.dot` on that raises `TypeError`. A hash is
     also not a semantic embedding: cosine similarity against a real MiniLM query
     vector is meaningless even in principle.

  So `crimedocuments.embedding` is either NULL or garbage, and `search_documents`
  cannot return a result. Deleting both also drops `sentence-transformers`
  (~2 GB with torch), which is the single largest deploy-size and cold-start risk
  in the project.

  **`build_case_documents` is worth keeping** — it works, and it is what turns
  `casemaster` rows into a document corpus. That is exactly the input an external
  vector store needs. Keep it, drop the two broken consumers.

  *Not deleted in Step 6:* this finding came after the agreed scope, and a
  reviewer should confirm it rather than take it on trust. The repair, if you
  prefer that route, is to delete the three stray module-level lines and replace
  the hash with a real encoder — at which point it duplicates your external RAG
  anyway.
- **`/predict/explain`.** Implemented only in Python, and unreachable: the SPA
  calls `/api/predict/explain`, the catch-all rule sends that to `scrb-backend`,
  which has no such route → 404. To expose it you need either a dedicated
  gateway rule (unauthenticated — it has no `authMiddleware`) or a Node
  reimplementation. Phase 2.

---

## 1. Console prerequisites — cannot be done from the repo

### 1.1 API Gateway catch-all rule — **required, still MISSING. This is the one blocking item.**

Confirmed from your console screenshot: the gateway has exactly 8 rules, one per
Python function, and **none for `scrb-backend`**. The list was alphabetical and
complete — `scrb-backend` would have sorted between `profilebehavioral` and
`search_documents`. The gateway was configured when only those 8 functions
existed and was never updated after the Node backend was added.

Consequence: **the frontend has no route to the backend.** Every `/api/*` call
404s at the gateway.

Create one rule:

```
ANY   /api/{path:(.*)}   ->   /server/scrb-backend/{path}
      Authentication:  Catalyst User Management        <-- set this
```

That is all that is needed. The spec §8 paths (`/query`, `/map/hotspots`,
`/graph/network`, …) are Express routes behind it, not separate gateway rules.

**Set the rule's authentication to Catalyst User Management.** The gateway then
validates the session (`GET /baas/{projectId}/check-auth`, reading
`ZD_CSRF_TOKEN` + the Zoho IAM cookies) and rejects unauthenticated calls
*before* the function runs — so a bug in `authMiddleware` cannot expose PII on its
own. `authMiddleware` still runs behind it; the two are independent layers.

> If a route that should work returns 401 with an empty body rather than the
> backend's `{"success":false,"message":"Unauthorized: …"}`, the rejection came
> from the **gateway**, not the function. That distinction is the fastest way to
> tell a session problem from a code problem.

### 1.2 Delete the 8 existing gateway rules — **required**

```
ANY  build_case_documents      ANY  predictexplain
ANY  generate_embeddings       ANY  predictforecast
ANY  graphNetworks             ANY  profilebehavioral
ANY  mapHotspot                ANY  search_documents
```

Two independent reasons:

1. **Four now point at functions that no longer exist** (`graphNetworks`,
   `mapHotspot`, `predictforecast`, `profilebehavioral`) and will 502/404.
2. **All eight publicly expose unauthenticated Basic I/O jobs that write to Data
   Store.** `authMiddleware` lives in `scrb-backend` only; none of these run it.
   Anyone who can reach the gateway can trigger them. ETL belongs on Cron or the
   console, not the public internet.

Delete all 8 unless something outside this repo calls them over HTTP.

### 1.3 Delete the 7 removed functions from the console — **required**

`catalyst deploy` uploads; it does not prune. The seven functions deleted from
the repo in Step 6 **stay deployed** until you remove them in the console.

### 1.4 Drop the write-only tables — optional, safe

`hotspot_clusters`, `offenderlinks`, `behavioral_clusters` were written only by
the deleted jobs and are read by nothing. **Keep `forecast_results`** —
`predictexplain` reads it.

### 1.5 Catalyst Authentication — ✅ **done**

Enabled, with three users invited and each assigned an SCRB role under
Authentication → Manage Application Users → Roles:

| User | Role | ZUID |
|---|---|---|
| Policymaker | Policymaker | 50044353296 |
| Analyst | Analyst | 50044353431 |
| Investigator | Investigator | 50044353276 |

### 1.6 `UserRoles` table — ❌ **not needed, do not create it**

Superseded. The backend originally ran
`SELECT ROLE_NAME FROM UserRoles WHERE ZUID = …` against a custom Data Store
table. Since you assigned roles natively in the console, the backend now reads
`getCurrentUser().role_details.role_name` straight off the session
(`ICatalystUser` carries it — SDK typings `utils/pojo/common.d.ts:131`). The
console is the single source of truth; there is no table to create or seed and
no second place for the mapping to drift out of sync.

Role names are matched case- and separator-insensitively, so `Policymaker`,
`policymaker`, and `Policy Maker` all work. Your three roles match exactly.

> Catalyst's **built-in** roles (`App User`, `App Administrator`) are not SCRB
> roles. A user holding one gets a 403 that names the role and points at the
> console — deliberately, so a misconfigured role is not mistaken for a broken
> deploy. Every real user needs one of the three SCRB roles.

### 1.7 Confirm the `Alerts` table exists

`utils/constants.js` names `Alerts`, `CrimeRecords`, `CaseFiles`,
`ConversationLog`, `QueryLog` in TitleCase, while `config/graphConstants.js` and
the Python jobs use the real lowercase schema (`casemaster`, `accused`, …).
`GET /alerts/active` queries `Alerts`. If it does not exist under that name the
route returns empty rather than failing loudly. See AUDIT.md §2d.

### 1.8 Rotate the QuickML endpoint key — **required**

`QUICKML_ENDPOINT_KEY` sat in plaintext in `functions/predict*/.env` and shipped
inside both root `.zip` archives. Treat it as compromised. It now survives in
`predictexplain/.env` only (the orphaned `predictforecast/.env` was removed with
its function). Audit P0-2.

---

## 2. Environment variables

`.env` files are gitignored but **are** uploaded with the function bundle.
Anything secret is better set as a console Environment Variable, which keeps it
out of the bundle entirely.

### `scrb-backend` — **all seven real values are currently EMPTY**

Checked directly: `functions/scrb-backend/.env` has every key present with a
blank value. `index.js` now loads `dotenv` as its first import (it previously
declared the dependency but never called it), so these *will* be read once
filled — but until then:

| Key | State | Consequence if left empty |
|---|---|---|
| `RAG_ENDPOINT` | **empty** | `POST /query` — the entire chat feature — **500s on every call.** Logs a boot warning. |
| `RAG_API_KEY` | **empty** | same |
| `RAG_VECTOR_STORE_ID` | **empty** | same |
| `QUICKML_FORECAST_MODEL_ID` | **empty** | `POST /predict/forecast` throws. Logs a boot warning. |
| `RAG_LLM_MODEL` | **empty** | Optional — code defaults to `claude-sonnet-4-6`. Passed through to your RAG service, so it only matters if that service honours the field. |
| `QUICKML_INTENT_MODEL_ID`, `QUICKML_SYNTHESIS_MODEL_ID` | **empty** | Read nowhere in the Node source. Harmless. |
| `PORT`, `NODE_ENV` | set | — |

Template with the full documentation of each key:
`functions/scrb-backend/.env.example`.

### `predictexplain`

`QUICKML_ENDPOINT_URL` / `QUICKML_ENDPOINT_KEY`, both set. The file was
originally malformed (key and value on separate lines) so `load_dotenv()` parsed
nothing; reformatted to `KEY=value`. Audit P0-7.

### Other Python functions

`env_variables` is `{}` in every `catalyst-config.json` and none of them read env
vars. Nothing to do.

---

## 3. Deploy

Two directories, one project. Run each from its own directory.

```bash
# --- backend ---------------------------------------------------------------
cd backend
catalyst deploy --only functions
# or just the API, skipping the 5 Python functions and their heavy deps:
catalyst deploy --only functions:scrb-backend

# --- frontend --------------------------------------------------------------
cd ../frontend
npm run predeploy          # npm ci && vite build && copy index.html -> 404.html
catalyst deploy --only client
```

`--only functions:scrb-backend` is worth preferring while iterating:
`search_documents` pulls `sentence-transformers` (and therefore torch, ~2 GB),
which dominates deploy time.

**Build order matters.** Vite bakes `VITE_API_BASE_URL` in at build time.
Editing `.env.production` after `npm run build` changes nothing — rebuild.

Client hosting is verified working end to end in the built output:

- `dist/index.html` references `./assets/…` (relative) — required for subpath hosting
- `axios.create({baseURL:'/api'})` is baked into the bundle
- `HashRouter`, so deep links need no server rewrites
- `dist/client-package.json` present with `homepage` and `404` → `index.html`
- `dist/404.html` written by the `postbuild` script

---

## 4. Verify

```bash
# 1. Function is up (bypasses the gateway)
curl -s https://<project-domain>/server/scrb-backend/health

# 2. Gateway rule is wired — same response through /api
curl -s https://<project-domain>/api/health

# 3. Auth is enforced — expect 401, NOT 200
curl -s -o /dev/null -w "%{http_code}\n" https://<project-domain>/api/map/hotspots

# 4. Role gates — Investigator: not 403. Policymaker/Analyst: 403.
curl -s -o /dev/null -w "%{http_code}\n" -H "Authorization: Zoho-oauthtoken $TOKEN" \
  https://<project-domain>/api/graph/network
```

Offline checks — no project, no seeded data, no network:

```bash
cd backend/functions/scrb-backend
node scratch/verify_rbac_matrix.mjs      # all 11 §8 routes mounted + role-guarded
node scratch/verify_graph_traversal.mjs  # graph expands; all 4 §8 contracts hold
```

Both exit 0 as of Step 6. Full endpoint sweep against a live deploy:

```bash
cd frontend
node scripts/catalyst-compat-check.mjs https://<project-domain>/api
```

---

## 5. Known gaps at deploy time

Deployment succeeds with all of these. They affect what *works*, not what ships.

| Gap | Effect | Blocking? |
|---|---|---|
| **No `/api/{path:(.*)}` gateway rule** | Frontend cannot reach the backend at all | **Yes** — §1.1 |
| **`RAG_*` and `QUICKML_FORECAST_MODEL_ID` empty** | Chat 500s; forecast throws | **Yes, functionally** — §2 |
| ~~Catalyst Auth / roles~~ | Done — 3 users with SCRB roles assigned natively | No — §1.5 |
| ~~SPA login is fake~~ | Fixed — Catalyst hosted sign-in is now the app entry point, roles come from `GET /auth/role`, and the role picker is gone | No — §6 |
| 8 stale/unauthenticated gateway rules | 4 point at deleted functions; all 8 expose unauthenticated Data Store writes | No, but fix it — §1.2 |
| 7 deleted functions still deployed | Dead code in the cloud | No — §1.3 |
| `POST /export/pdf` returns JSON, not a PDF | SPA requests a blob and gets a JSON blob; download is broken | No — Phase 3, needs a SmartBrowz template decision |
| 11 endpoints unimplemented | `/voice/*` ×2, `/insights/demographic`, `/predict/explain`, `/case/*` ×4, `/audit/*` ×2 → 404. UI degrades to empty states. | No — Phase 2, AUDIT §2a |
| Graph topology vs the frontend typedef | `networkService.js` declares `NetworkNode.type` as `'accused'\|'location'`; the traversal emits a heterogeneous graph (case, victim, accused, unit, district, court, …). Field *names* were aligned in Step 5; the topology was not. `weight` is a constant 1 rather than the real shared-case count. | No — product decision |
| `generate_embeddings` cannot run at all | `NameError` at import time (module-scope use of `text`), and its SHA-256 "embedding" is type-incompatible with `search_documents`' cosine step. The local RAG search half is dead. | No — recommend deleting both, §0 |
| `search_documents` pulls `sentence-transformers` | ~2 GB with torch; the largest deploy-size and cold-start risk in the project. Moot if deleted per §0. | No — AUDIT P1-6 |
| Verification uses synthetic fixtures | The harnesses prove traversal mechanics and contract shapes against a 1-case/2-accused fixture. They do **not** prove your real column names line up. Deep branches (bank accounts, transactions, arrests) are unexercised. | No, but expect surprises on real data |
| `cors()` is allow-all | **Not an issue here** — SPA and function share the project and origin, so CORS never engages. Would need `cors({origin, credentials:true})` + `withCredentials:true` only if the SPA moves off-origin. | No |

---

## 6. Authentication — how it works now

Sign-in is **Catalyst's hosted page**; the SPA contains no login form and no
token handling.

```
user hits https://<domain>/
      -> 302 /app/  -> client-package.json homepage = /__catalyst/auth/login
      -> Zoho hosted sign-in  (MFA / SSO handled by Zoho)
      -> success -> /baas/<projectId>/signin-redirect
      -> gateway rewrites via login_redirect -> /app/index.html
      -> SPA boots -> GET /auth/role -> { user_id, role, catalystRole, ... }
```

**The session is a cookie**, not a token: `ZD_CSRF_TOKEN` plus the Zoho IAM
cookies. Since the SPA (`/app/*`) and the API (`/api/*`) share the project
domain, the browser attaches it to every request by itself — no `Authorization`
header, no `withCredentials`, nothing in `.env.production`.

**Roles are not client-selectable.** They come from the console assignment
(§1.5), the backend reads them off the session, and the SPA only *displays* what
`GET /auth/role` reports. The old login screen let the user choose their own
role, which made every gate decorative.

`/auth/role` is deliberately ungated (`authMiddleware` only, no role check) —
the SPA calls it to *discover* its role, so requiring a valid role would be
circular. It returns `role: null` plus the raw `catalystRole` for a signed-in
user whose console role is not an SCRB role, which is what lets the SPA tell
"no role assigned" apart from "not signed in".

### Three states the SPA renders

| State | When | What the user sees |
|---|---|---|
| `signed-in` | session valid, console role maps to an SCRB role | the app |
| `no-role` | session valid, role is e.g. Catalyst's built-in `App User` | a screen naming the role and the console path an admin must fix |
| `signed-out` | 401, or `/auth/role` unreachable | "Sign in with Zoho" button |

A non-401 failure is **not** treated as signed-out. Otherwise a backend outage
would bounce the user into a sign-in loop instead of showing an error.

### If sign-in misbehaves

`homepage` is set to `/__catalyst/auth/login`. That is the one value in this
setup I could not verify offline — nothing was deployed yet, so every probe
returned 404. Confirm it against the console (Authentication → the hosted login
page URL) or from the client URL the CLI prints after `catalyst deploy --only
client`. If it differs, `public/client-package.json` is the only place to change
— the SPA never hardcodes it, and navigates to `/` on 401 so Catalyst owns the
redirect.

Same for sign-out: `authService.signOut()` uses `/baas/logout`, which is the path
the CLI's own gateway auth cache keys off. One constant, one place to fix.

## 7. Changes made for deploy readiness

Backend (`backend/`, branch `chore/pre-deploy-audit`):

- **Role resolution moved to the Catalyst session.** `authMiddleware` reads
  `role_details.role_name`; the `UserRoles` Data Store table and its ZCQL lookup
  are gone, so authorization has one source of truth (the console) instead of
  two. Also fixed an id conflation — `user_id` and `zuid` are different fields on
  `ICatalystUser`, but both `authMiddleware` and `authService` set
  `zuid = user_id`, which was self-consistent but wrote the wrong identifier into
  `CONVERSATION_LOG.ZUID`. `POST /auth/assign-role` now returns 501 pointing at
  the console rather than writing to a table nothing reads.
- **Step 6** — removed the 7 duplicate Python functions; `catalyst.json` targets
  13 → 6; removed the orphaned `predictforecast/.env`.
- **`requirements.txt`** — added imports that would have failed at function
  import time: `python-dotenv` (`predictexplain`), `sentence-transformers`
  (`search_documents`). (`scikit-learn`/`requests` additions went with the
  functions that were later deleted.)
- **`predictexplain/.env`** — reformatted from two-lines-per-entry to `KEY=value`
  so `load_dotenv()` parses it.
- **`scrb-backend/index.js`** — `import 'dotenv/config'` as the **first** import;
  services read `process.env` at module scope and ESM evaluates imports in order.
- **`scrb-backend/.env.example`** — new, committed, secret-free.
- **Removed 12 orphaned `certifi-*.dist-info/` directories** — metadata with no
  package, no `certifi` import anywhere, uploaded on every deploy.
- Steps 4 and 5 (route surface + request/response contracts) — see
  `backend/REMEDIATION_LOG.md`.

Frontend (`frontend/`, branch `chore/pre-deploy-audit`):

- **`catalyst.json`** — the client config was nested under a `command` key, which
  the CLI never reads (`config/lib/client.js:26` reads top-level `client`;
  `command` is the AppSail shape). `source()` was falling back to a
  non-existent `client/` directory. Moved to top level; added a
  `node_modules/` ignore.
- **`.env.production`** — `VITE_API_BASE_URL` was the literal `#placeholder#`,
  which would have made the SPA call `#placeholder#/query`. Now `/api`, with the
  cross-origin and no-gateway alternatives documented inline.
- **`vite.config.js`** — dev proxy pointed at a dead Flask server on
  `localhost:5000`; now mirrors the production gateway rule against
  `catalyst serve` on `:3000`.
- **`apiClient.js`** — unwraps the backend's `{success, data}` envelope so the
  service layer receives payloads.
- **`.catalystrc`** — copied from the backend so the client deploys to the same
  project; gitignored.
- **Committed all 139 previously untracked files**, including all of `src/`.
