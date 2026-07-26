// Verify catalyst-user-rules.json against the CLI's OWN compile() implementation,
// plus a faithful replay of validate()'s per-rule guards read from
// zcatalyst-cli/lib/apig-utils.js. The compile() call below is literally the
// CLI's code path, not a reimplementation of it.
const fs = require('fs');
const path = require('path');

// Resolve both inputs rather than hardcoding this machine's paths, so the
// harness survives being run from another checkout or another workstation.
const CLI = path.join(
  require('child_process').execSync('npm root -g', { encoding: 'utf8' }).trim(),
  'zcatalyst-cli'
);
const rules = JSON.parse(
  fs.readFileSync(path.join(__dirname, '..', 'catalyst-user-rules.json'), 'utf8')
);
const SYSTEM = require(CLI + '/lib/util_modules/constants/lib/apig-rules').default;

let pass = 0, fail = 0;
const check = (name, cond, detail) => {
  console.log((cond ? 'PASS  ' : 'FAIL  ') + name + (detail ? ' - ' + detail : ''));
  if (cond) { pass++; } else { fail++; }
};

// --- validate() guards, in source order -------------------------------------
const names = [];
const sourceByMethod = {};
for (const r of rules) {
  check('[' + r.name + '] has a name', !!r.name);
  check('[' + r.name + '] name is unique', names.indexOf(r.name) === -1);
  names.push(r.name);
  check('[' + r.name + '] source_endpoint present', r.source_endpoint != null);

  const bucket = sourceByMethod[r.source_endpoint] || (sourceByMethod[r.source_endpoint] = {});
  const dup = bucket[r.method];
  check('[' + r.name + '] no duplicate source_endpoint+method', !dup, dup ? 'clashes with ' + dup : '');
  bucket[r.method] = r.name;

  const isClient = r.target === 'client' ||
    (typeof r.target_endpoint === 'string' && r.target_endpoint.indexOf('/app/') === 0);
  if (isClient) {
    check('[' + r.name + '] client target carries NO authentication',
      r.authentication === undefined || r.authentication === null);
    check('[' + r.name + '] client target carries NO target_id', r.target_id === undefined);
  }

  for (const part of r.source_endpoint.split('/')) {
    if (part.charAt(0) !== '{') continue;
    const bits = part.slice(1, -1).split(':');
    let ok = bits.length === 2;
    if (ok) { try { new RegExp(bits[1]); } catch (e) { ok = false; } }
    check('[' + r.name + '] path var ' + part + ' is a valid {var:regex}', ok);
  }
}

// --- the CLI's real compile(), invoked directly ------------------------------
let compileErr = null;
try {
  const mod = require(CLI + '/lib/apig-utils.js');
  mod.apigUtils.compile(rules.concat(SYSTEM));
} catch (e) {
  compileErr = e;
}
check('CLI apigUtils.compile() accepts these rules + the 29 system rules',
  !compileErr, compileErr ? String(compileErr.message || compileErr).slice(0, 200) : '');

// --- routing coverage: what the SPA actually requests -----------------------
const all = rules.concat(SYSTEM);
const ESCAPE = new RegExp('[.*+?^${}()|\\[\\]\\\\]', 'g');

function toRegex(src) {
  const body = src.split('/').map(function (p) {
    if (p.charAt(0) === '{') {
      const bits = p.slice(1, -1).split(':');
      return '(?:' + bits.slice(1).join(':') + ')';
    }
    return p.replace(ESCAPE, '\\$&');
  }).join('/');
  return new RegExp('^' + body + '$');
}

function routed(path, method) {
  for (const r of all) {
    if (r.method && r.method !== 'ANY' && r.method !== method) continue;
    try { if (toRegex(r.source_endpoint).test(path)) return r; } catch (e) { /* skip */ }
  }
  return null;
}

const cases = [
  ['/app/index.html', 'GET', 'the SPA shell -- login_redirect resolves here'],
  ['/app/assets/index-BKbYTOsY.js', 'GET', 'a hashed JS bundle'],
  ['/app/client-package.json', 'GET', 'the client manifest'],
  ['/app/404.html', 'GET', 'the 404 fallback'],
  ['/api/auth/role', 'GET', 'role discovery'],
  ['/api/alerts/active', 'GET', 'the alert feed'],
  ['/api/predict/forecast', 'POST', 'the forecast call'],
  ['/__catalyst/auth/login', 'GET', 'the hosted login page -- our homepage'],
  ['/baas/54650000000013025/check-auth', 'GET', 'the session check AuthContext makes'],
  ['/baas/logout', 'GET', 'sign-out']
];
console.log('\n--- routing coverage (local rules + the 29 frozen system rules) ---');
for (const c of cases) {
  const r = routed(c[0], c[1]);
  check(c[1] + ' ' + c[0] + ' is routed (' + c[2] + ')', !!r, r ? '-> ' + r.name : 'NO RULE MATCHES');
}

// --- confirm the gap I claim exists actually exists -------------------------
console.log('\n--- the finding, stated as a test ---');
const systemAppRules = SYSTEM.filter(function (r) {
  return typeof r.source_endpoint === 'string' && r.source_endpoint.indexOf('/app') === 0;
});
check('NO system rule covers /app/* (so the client rule is mandatory)',
  systemAppRules.length === 0, systemAppRules.length + ' system rules match /app*');

const apiOnly = rules.filter(function (r) { return r.name === 'backend-gateway'; }).concat(SYSTEM);
function routedIn(set, path) {
  for (const r of set) {
    try { if (toRegex(r.source_endpoint).test(path)) return r; } catch (e) { /* skip */ }
  }
  return null;
}
check('with ONLY the pulled /api rule, /app/index.html matches nothing',
  !routedIn(apiOnly, '/app/index.html'));

console.log('\n' + (fail === 0 ? 'ALL PASS' : fail + ' FAILED') + '  (' + pass + ' passed)');
process.exitCode = fail === 0 ? 0 : 1;
