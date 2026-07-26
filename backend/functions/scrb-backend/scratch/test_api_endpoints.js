// Route-surface smoke harness.
//
// Paths below are the POST-STEP-4 surface: the spec §8 routes the frontend
// actually calls (see frontend/src/api/endpoints.js), plus the non-§8 routes
// retained for capability. Run it under `catalyst serve` — outside a Catalyst
// runtime every request 500s in the SDK-init middleware.
//
// Expectation with RBAC live (Step 2): unauthenticated calls return 401. That
// is a PASS for this harness — it proves the path is mounted and guarded. Only
// a 404 means the route is missing.

import http from 'http';
import app from '../index.js';

// Start a local HTTP server using Express app
const server = http.createServer(app);

const PORT = 8089;

server.listen(PORT, async () => {
  console.log(`Test server running on port ${PORT}`);

  const endpoints = [
    { name: 'Health Check', method: 'GET', path: '/health' },

    // ---- spec §8 surface (what the SPA calls) --------------------------------
    { name: 'Auth Role', method: 'GET', path: '/auth/role' },
    { name: 'Query Handle', method: 'POST', path: '/query', body: { query: 'Show cases in zone 3' } },
    { name: 'Map Hotspots', method: 'GET', path: '/map/hotspots' },
    { name: 'Map District', method: 'GET', path: '/map/district/1' },
    { name: 'Graph Network (global)', method: 'GET', path: '/graph/network' },
    { name: 'Graph Network (by case)', method: 'GET', path: '/graph/network?caseId=101' },
    { name: 'Profile Behavioral', method: 'GET', path: '/profile/behavioral?accused_id=1' },
    { name: 'Predict Forecast', method: 'POST', path: '/predict/forecast', body: { region: 'District 1', horizon: '30d' } },
    { name: 'Alerts Active', method: 'GET', path: '/alerts/active' },
    { name: 'Conversation Thread', method: 'GET', path: '/conversation/thread_123' },
    { name: 'Export PDF', method: 'POST', path: '/export/pdf', body: { session_id: 'thread_123', role: 'Analyst' } },

    // ---- retained, no frontend caller ---------------------------------------
    { name: 'Assign Role', method: 'POST', path: '/auth/assign-role', body: { zuid: '123', email: 'test@example.com', roleName: 'Analyst' } },
    { name: 'Query By Id', method: 'GET', path: '/query/101' },
    { name: 'Report Summary', method: 'GET', path: '/report/summary?zone=3' },
    { name: 'Report Thread', method: 'GET', path: '/report/thread_123' },
    { name: 'Map Crimes', method: 'GET', path: '/map/crimes' },
    { name: 'Map Case', method: 'GET', path: '/map/case/101' },
    { name: 'Map Stations', method: 'GET', path: '/map/stations' },
    { name: 'Map Heatmap', method: 'GET', path: '/map/heatmap' },
    { name: 'Map Dashboard', method: 'GET', path: '/map/dashboard' },
    { name: 'Graph Case', method: 'GET', path: '/graph/case/101' },
    { name: 'Graph Accused', method: 'GET', path: '/graph/accused/1' },
    { name: 'Graph Transaction', method: 'GET', path: '/graph/transaction/1' },
    { name: 'Graph Network (path param)', method: 'GET', path: '/graph/network/101' },
    { name: 'Profile Behavioral (path param)', method: 'GET', path: '/profile/behavioral/1' },
    { name: 'Profile Query', method: 'POST', path: '/profile/query', body: { question: 'Who is repeat offender?' } },
    { name: 'Profile Generate', method: 'POST', path: '/profile/generate', body: { accusedId: '1' } },
    { name: 'Export Thread (legacy)', method: 'GET', path: '/export/thread_123' },
    { name: 'History (legacy alias)', method: 'GET', path: '/history' },
    { name: 'History Thread (legacy alias)', method: 'GET', path: '/history/thread_123' }
  ];

  console.log(`\nTesting ${endpoints.length} API endpoints...\n`);

  const results = [];

  for (const ep of endpoints) {
    try {
      const url = `http://localhost:${PORT}${ep.path}`;
      const res = await fetch(url, {
        method: ep.method,
        headers: { 'Content-Type': 'application/json' },
        ...(ep.body && { body: JSON.stringify(ep.body) })
      });

      const data = await res.json().catch(() => null);

      results.push({
        name: ep.name,
        endpoint: `${ep.method} ${ep.path}`,
        status: res.status,
        // A 404 here is a routing failure, not a handled response — the app's
        // catch-all answers 404 for any path that is not mounted.
        ok: res.status !== 404 && res.status < 500,
        missing: res.status === 404,
        response: data
      });
      console.log(`[${res.status}] ${ep.method} ${ep.path} - Msg: ${data?.message || data?.error || 'OK'}`);
    } catch (err) {
      results.push({
        name: ep.name,
        endpoint: `${ep.method} ${ep.path}`,
        status: 'ERROR',
        ok: false,
        error: err.message
      });
      console.log(`[ERR] ${ep.method} ${ep.path} - Error: ${err.message}`);
    }
  }

  console.log('\n=== AUDIT SUMMARY ===');
  console.log(`Total Tested: ${results.length}`);
  const passed = results.filter(r => r.ok).length;
  const missing = results.filter(r => r.missing);
  console.log(`Passed (2xx/3xx/4xx handled response, incl. 401 under RBAC): ${passed}`);
  console.log(`Unhandled Failures (5xx/Unhandled Error): ${results.length - passed - missing.length}`);
  console.log(`Route NOT MOUNTED (404): ${missing.length}`);
  if (missing.length) {
    missing.forEach(r => console.log(`  - ${r.endpoint}`));
  }

  server.close(() => process.exit(0));
});
