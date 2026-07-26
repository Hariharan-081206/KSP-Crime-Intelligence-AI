/**
 * scratch/verify_graph_traversal.mjs
 *
 * Regression test for the `catalystApp` plumbing bug.
 *
 * THE BUG: networkGraphService and behaviouralProfileService call
 * datastoreService/relationshipService with the legacy 2-arg form. Those
 * functions' arg-shifting shims set `catalystApp = null`, and `executeQuery`
 * then ran `null.zcql()`. The adapter swallowed the TypeError and returned
 * null/[], so the traversal produced an EMPTY graph and the controller answered
 * 404 "no network could be built" — no matter what was in the database.
 *
 * WHY THE OTHER HARNESS COULDN'T CATCH IT: verify_rbac_matrix.mjs stubs ZCQL to
 * return `[]`. An empty graph is the expected result there, so the bug and a
 * correct-but-dataless run are indistinguishable. This harness serves REAL rows
 * — so an empty graph is unambiguously a failure.
 *
 * Run:  node scratch/verify_graph_traversal.mjs   (from functions/scrb-backend)
 * Exit: 0 = traversal reached the data, 1 = still broken.
 */

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const catalyst = require('zcatalyst-sdk-node');

// ---------------------------------------------------------------------------
// Fixture: one case, two co-accused. Enough to prove the traversal walks from a
// case record to related rows — which is exactly the path that was dead.
// ---------------------------------------------------------------------------
const CASE_ID = 'CASE-1';

// COLUMN NAMES MUST MATCH config/relationships.js, NOT the traversal code.
// This fixture previously gave `casemaster` a `unitid` column. No such column
// exists — the FK is `policestationid` — so the harness passed while the
// deployed graph came back as isolated case nodes with no unit, district,
// court or officer attached. A fixture that mirrors the code rather than the
// schema tests nothing. Same reason `unit`/`district` carry `unitname` /
// `districtname` here: `name` is not what those tables use.
const ROWS = {
  casemaster: [
    {
      ROWID: '1',
      casemasterid: CASE_ID,
      crimenumber: 'FIR-001',
      policestationid: 'U-1',
      districtid: 'D-1',
    },
  ],
  accused: [
    { ROWID: '10', accusedmasterid: 'ACC-1', casemasterid: CASE_ID, name: 'Accused One' },
    { ROWID: '11', accusedmasterid: 'ACC-2', casemasterid: CASE_ID, name: 'Accused Two' },
  ],
  unit: [{ ROWID: '20', unitid: 'U-1', unitname: 'Central PS', districtid: 'D-1' }],
  district: [{ ROWID: '30', districtid: 'D-1', districtname: 'District One' }],

  // Pre-seeded transcript for GET /conversation/:sessionId. ZUID must match the
  // stubbed identity below or the route's ownership check returns 403.
  // TABLES.CONVERSATION_LOG is 'ConversationLog'; the stub lowercases table
  // names when matching, hence the key here.
  conversationlog: [
    {
      ROWID: '90',
      THREAD_ID: 'sess-123',
      ZUID: 'zuid-test',
      QUESTION: 'How many thefts in District One?',
      ANSWER: 'There were 12 reported thefts.',
      CREATEDTIME: '2026-07-26T05:00:00Z',
    },
  ],
};

// Rows written via the Data Store API (not ZCQL) land here so the audit
// write-path can be asserted instead of silently failing.
const insertedRows = [];

let zcqlCalls = 0;

// Every QuickML prediction the run made, so the forecast path can be asserted
// on rather than inferred from a status code.
const quickMlCalls = [];
let nullAppErrors = 0;

/**
 * Minimal ZCQL that answers `SELECT * FROM <table> ...` from the fixture above,
 * honouring a `WHERE <col>='<val>'` filter when present. Returns rows in
 * Catalyst's `[{ <table>: {...} }]` envelope, which is what datastoreService
 * unwraps via `result[0][table]`.
 */
function executeZCQLQuery(query) {
  zcqlCalls++;
  const raw = /FROM\s+([A-Za-z_][A-Za-z0-9_]*)/i.exec(query)?.[1];
  if (!raw) return [];

  // Fixtures are keyed lowercase for convenience, but the returned envelope must
  // be keyed by the table name EXACTLY as queried — that is what Catalyst does,
  // and what datastoreService relies on (`result[0][table]`, `r => r[table]`).
  // Lowercasing the envelope key made every read against a mixed-case table
  // (TABLES.CONVERSATION_LOG = 'ConversationLog') yield undefined rows.
  const rowsForTable = ROWS[raw.toLowerCase()];
  if (!rowsForTable) return [];

  let rows = rowsForTable;
  const where = /WHERE\s+([A-Za-z0-9_]+)\s*=\s*'([^']*)'/i.exec(query);
  if (where) {
    const [, col, val] = where;
    rows = rows.filter((r) => String(r[col]) === val);
  }
  return rows.map((r) => ({ [raw]: r }));
}

const stubApp = {
  zcql: () => ({ executeZCQLQuery: async (q) => executeZCQLQuery(q) }),
  userManagement: () => ({
    getCurrentUser: async () => ({ user_id: 'zuid-test', email_id: 'tester@example.com' }),
  }),
  datastore: () => ({
    table: (tableName) => ({
      getPagedRows: async () => ({ data: [] }),
      // Real enough to assert on. Previously absent, so every audit write threw
      // "table.insertRow is not a function", was swallowed, and the conversation
      // linkage could not be verified at all.
      insertRow: async (row) => {
        insertedRows.push({ table: tableName, row });
        return row;
      },
    }),
  }),
  // Mirrors the REAL SDK surface: QuickML#predict(endPointKey, inputData), see
  // zcatalyst-sdk-node/lib/quick-ml/quick-ml.js. The previous stub exposed
  // `.model(id).predict()`, a shape the SDK does not have — so it would have
  // "passed" against code that could never work in production. Returns the
  // documented { status, result: { "<date>": n } } envelope.
  quickML: () => ({
    predict: async (endPointKey, inputData) => {
      quickMlCalls.push({ endPointKey, inputData });
      const date = Object.values(inputData ?? {})[0];
      return { status: 'success', result: { [date]: 12 } };
    },
  }),
  cache: () => ({ segment: () => ({ get: async () => null, put: async () => null }) }),
};

// The role now arrives inside the session (role_details.role_name), configured
// in the Catalyst console, so there is no ZCQL role lookup to short-circuit.
// Still mutable: the routes under test have different allow-lists — /graph/* is
// Investigator-only while /predict/forecast is Analyst-only, so a single fixed
// role would 403 on one of them and the assertion would be meaningless.
let CURRENT_ROLE = 'Investigator';
stubApp.userManagement = () => ({
  getCurrentUser: async () => ({
    user_id: 'user-test-001',
    zuid: 'zuid-test-001',
    email_id: 'tester@example.com',
    role_details: { role_id: 'r1', role_name: CURRENT_ROLE },
  }),
});

catalyst.initialize = () => stubApp;

// Surface the exact failure the bug produced, instead of letting it be swallowed.
const origError = console.error;
process.on('uncaughtException', (e) => {
  if (/reading 'zcql'/.test(String(e))) nullAppErrors++;
  origError(e);
});

const { default: app } = await import('../index.js');

const server = app.listen(0);
await new Promise((r) => server.once('listening', r));
const base = `http://127.0.0.1:${server.address().port}`;

async function get(path) {
  const res = await fetch(base + path);
  let body = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON */
  }
  return { status: res.status, body };
}

const results = [];
let failures = 0;

function check(name, ok, detail) {
  results.push(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

// --- 1. Case-scoped graph must EXPAND, not just return the seed node --------
// The fixture is 1 case + 2 co-accused, so a correct traversal yields at least
// 3 nodes and 2 case->accused edges. Asserting `> 0` would have passed while
// the accused branch was entirely dead (the double isVisited() bug), so assert
// the real shape.
{
  const { status, body } = await get(`/graph/network?caseId=${CASE_ID}`);
  const nodes = body?.data?.nodes ?? [];
  const edges = body?.data?.edges ?? [];
  const accused = nodes.filter((n) => n.type === 'accused');
  check(
    'GET /graph/network?caseId= expands case -> accused',
    status === 200 && nodes.length >= 3 && accused.length === 2 && edges.length >= 2,
    `status=${status} nodes=${nodes.length} accused=${accused.length} edges=${edges.length}`,
  );
}

// --- 2. Global graph must expand too ----------------------------------------
{
  const { status, body } = await get('/graph/network');
  const nodes = body?.data?.nodes ?? [];
  const accused = nodes.filter((n) => n.type === 'accused');
  check(
    'GET /graph/network (global) expands from the seed cases',
    status === 200 && nodes.length >= 3 && accused.length === 2,
    `status=${status} nodes=${nodes.length} accused=${accused.length}`,
  );
}

// --- 3. The null-app TypeError must be gone entirely ------------------------
check(
  'no "reading \'zcql\'" TypeError raised',
  nullAppErrors === 0,
  `count=${nullAppErrors}`,
);

// --- 4. The data layer was actually exercised -------------------------------
check('ZCQL was queried', zcqlCalls > 0, `calls=${zcqlCalls}`);

// --- 5. Node/edge shape must match the frontend contract --------------------
// networkService.js: NetworkNode { id, type, name, centrality }
//                    NetworkEdge { source, target, weight }
{
  const { body } = await get(`/graph/network?caseId=${CASE_ID}`);
  const nodes = body?.data?.nodes ?? [];
  const edges = body?.data?.edges ?? [];

  const nodesOk =
    nodes.length > 0 &&
    nodes.every(
      (n) =>
        typeof n.id === 'string' &&
        typeof n.type === 'string' &&
        typeof n.name === 'string' &&
        typeof n.centrality === 'number',
    );
  check('every node carries id/type/name/centrality', nodesOk,
    `sample=${JSON.stringify(nodes[0] && { id: nodes[0].id, type: nodes[0].type, name: nodes[0].name, centrality: nodes[0].centrality })}`);

  const edgesOk =
    edges.length > 0 &&
    edges.every(
      (e) =>
        typeof e.source === 'string' &&
        typeof e.target === 'string' &&
        typeof e.weight === 'number',
    );
  check('every edge carries source/target/weight', edgesOk, `edges=${edges.length}`);

  // Centrality must be normalized (0..1) and non-zero for a connected node.
  const inRange = nodes.every((n) => n.centrality >= 0 && n.centrality <= 1);
  const anyNonZero = nodes.some((n) => n.centrality > 0);
  check('centrality is normalized to 0..1 and non-zero where connected',
    inRange && anyNonZero,
    `values=${nodes.map((n) => n.centrality).join(',')}`);
}

// --- 6. Forecast accepts the frontend's snake_case body ---------------------
// Pre-Step-5 the schema required { region, crimeType, horizon }, so the SPA's
// { district, crime_type, window_days } was rejected with 400 before reaching
// QuickML. A 400 here is the regression; anything else means it got through.
//
// /predict/forecast is Analyst-only, so switch roles first — as Investigator
// both forecast checks would 403 at roleMiddleware and never reach the
// controller, making them vacuous.
CURRENT_ROLE = 'Analyst';
{
  const res = await fetch(`${base}/predict/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ district: 'D1', crime_type: 'theft', window_days: 30 }),
  });
  let body = null;
  let msg = '';
  try {
    body = await res.json();
    msg = JSON.stringify(body).slice(0, 90);
  } catch { /* ignore */ }
  check('POST /predict/forecast accepts { district, crime_type, window_days }',
    res.status !== 400, `status=${res.status} ${msg}`);

  // The forecast used to reach QuickML over bare fetch(), which carries no Zoho
  // credential — every live call came back 400 INVALID_TICKET. It now goes
  // through app.quickML().predict(), so assert the SDK was actually used, that
  // the endpoint key was passed, and that a number came back out the far end.
  // The key is a live credential — report only that one was present and how
  // long it was. Printing it would put it in terminal scrollback and CI logs.
  const key = quickMlCalls[0]?.endPointKey;
  check('forecast calls QuickML through the SDK with the endpoint key',
    quickMlCalls.length > 0 && quickMlCalls.every((c) => typeof c.endPointKey === 'string' && c.endPointKey.length > 0),
    `calls=${quickMlCalls.length} key=${key ? `[set, ${key.length} chars]` : '(none)'}`);

  check('forecast sends the configured date feature as the model input',
    quickMlCalls.every((c) => Object.keys(c.inputData ?? {}).length === 1),
    `inputData=${JSON.stringify(quickMlCalls[0]?.inputData ?? null)}`);

  const predicted = body?.data?.predictedCount ?? body?.predictedCount;
  check('forecast returns a numeric predictedCount from the model response',
    typeof predicted === 'number' && Number.isFinite(predicted),
    `predictedCount=${predicted}`);
}

// --- 7. Forecast still rejects a genuinely empty body ----------------------
{
  const res = await fetch(`${base}/predict/forecast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({}),
  });
  check('POST /predict/forecast rejects an empty body with 400',
    res.status === 400, `status=${res.status}`);
}

// --- 8. /auth/role exposes the §8 field name -------------------------------
// Any authenticated role may read this one.
CURRENT_ROLE = 'Investigator';
{
  const { status, body } = await get('/auth/role');
  const data = body?.data ?? {};
  check('GET /auth/role returns user_id and role',
    status === 200 && 'user_id' in data && 'role' in data,
    `status=${status} keys=${Object.keys(data).join(',')}`);
}

// --- 9. Conversation transcript shape --------------------------------------
// The frontend's conversationService expects { session_id, turns:[{role,text,
// timestamp}] }, not raw CONVERSATION_LOG rows. One log row holds a QUESTION and
// an ANSWER, so it must expand into two turns.
{
  const { status, body } = await get('/conversation/sess-123');
  const data = body?.data ?? {};
  const turns = data.turns ?? [];
  const roles = turns.map((t) => t.role).join(',');
  check('GET /conversation/:sessionId returns { session_id, turns[] }',
    status === 200 &&
      data.session_id === 'sess-123' &&
      turns.length === 2 &&
      roles === 'user,assistant' &&
      turns.every((t) => typeof t.text === 'string'),
    `status=${status} session_id=${data.session_id} turns=${turns.length} roles=${roles}`);
}

// --- 10. Audit writes are keyed on the caller's session id ------------------
// This is the other half of the conversation fix: auditService.log used to drop
// the thread id, so logConversation minted a random THREAD_ID and no row was
// ever retrievable by the SPA's session_id.
{
  const auditService = await import('../services/auditService.js');
  const { runWithCatalystApp } = await import('../services/catalystContext.js');
  insertedRows.length = 0;
  await runWithCatalystApp(stubApp, async () => {
    await auditService.log(stubApp, {
      action: 'QUERY_EXECUTED',
      threadId: 'sess-abc',
      user: { zuid: 'zuid-test', email: 't@example.com', role: 'Investigator' },
      details: { question: 'q?', answer: 'a.' },
    });
  });
  const row = insertedRows.at(-1)?.row;
  check('auditService.log persists THREAD_ID = caller session id',
    row?.THREAD_ID === 'sess-abc' && row?.QUESTION === 'q?' && row?.ANSWER === 'a.',
    `THREAD_ID=${row?.THREAD_ID} QUESTION=${row?.QUESTION} ANSWER=${row?.ANSWER}`);
}

console.log('\n=== catalystApp plumbing / graph traversal ===\n');
console.log(results.join('\n'));
console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`);

// Set the code and let the loop drain. Calling process.exit() while the
// listener is still closing trips a libuv handle assertion on Windows, which
// masks the real exit code with 127.
process.exitCode = failures === 0 ? 0 : 1;
server.close();
