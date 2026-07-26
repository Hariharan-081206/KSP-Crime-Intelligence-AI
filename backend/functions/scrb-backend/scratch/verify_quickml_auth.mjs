/**
 * verify_quickml_auth.mjs
 *
 * Offline proof that outbound QuickML calls are authenticated with the
 * APPLICATION identity, not the signed-in user's.
 *
 * WHY THIS EXISTS
 * ---------------
 * Two deploys were burned on this. The first sent no credential at all and the
 * endpoint answered `400 INVALID_TICKET`. The second sent a credential — but
 * the wrong one — and the endpoint answered `401 INVALID_OAUTHTOKEN`.
 *
 * `CatalystCredential` carries two credentials and returns whichever the current
 * scope selects, and it constructs itself in 'user' scope
 * (zcatalyst-sdk-node/lib/utils/credential.js). So a plain `getToken()` hands
 * back the signed-in SCRB officer's token, which QuickML's management APIs do
 * not accept. The SDK avoids this because AuthorizedHttpClient.send() calls
 * `switchUser(request.user)` first and QuickML.predict() asks for
 * `user: 'admin'`.
 *
 * Neither existing harness could have caught it: both stub the Catalyst app with
 * a plain object that has no `credential` at all, so the scope logic never runs.
 * This file builds a REAL CatalystCredential from the header shape the platform
 * hands a deployed function, which is the only way the bug is visible offline.
 *
 * Run: node scratch/verify_quickml_auth.mjs
 */

import { CatalystCredential } from 'zcatalyst-sdk-node/lib/utils/credential.js';
import { runWithCatalystApp } from '../services/catalystContext.js';
import { buildAuthHeaders } from '../services/catalystAuth.js';

const ADMIN_TOKEN = 'ADMIN-TOKEN-application-identity';
const USER_TOKEN = 'USER-TOKEN-signed-in-officer';

let failures = 0;
function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures++;
}

/** The credential object Catalyst injects into a function request. */
function makeCredential() {
  return new CatalystCredential({
    'x-zc-admin-cred-type': 'token',
    'x-zc-admin-cred-token': ADMIN_TOKEN,
    'x-zc-user-cred-type': 'token',
    'x-zc-user-cred-token': USER_TOKEN,
    'x-zc-user-type': 'user',
  });
}

function makeApp(credential) {
  return {
    credential,
    config: {
      projectId: '54650000000013025',
      projectKey: 'PROJECT-KEY',
      environment: 'Development',
    },
  };
}

/** Run `fn` with the app bound to the request context, as index.js does. */
function withApp(app, fn) {
  return new Promise((resolve, reject) => {
    runWithCatalystApp(app, () => fn().then(resolve, reject));
  });
}

console.log('\n=== QuickML outbound authentication ===\n');

const credential = makeCredential();
const app = makeApp(credential);

// The default scope is the one the bug depended on. Assert it, so if a future
// SDK changes the default this file explains why the rest still matters.
check('CatalystCredential defaults to user scope (the trap)',
  credential.getCurrentUser() === 'user',
  `currentUser=${credential.getCurrentUser()}`);

const headers = await withApp(app, () => buildAuthHeaders(null, 'verify'));
const authValue = String(headers.Authorization ?? '');
const scheme = authValue.split(' ')[0];
const token = authValue.split(' ').slice(1).join(' ');

check('an Authorization header is produced', Boolean(headers.Authorization), `scheme=${scheme}`);

check('the scheme is Zoho-oauthtoken', scheme === 'Zoho-oauthtoken', `got "${scheme}"`);

// The assertion this file exists for.
check('the ADMIN token is sent, not the end user\'s',
  token === ADMIN_TOKEN,
  token === USER_TOKEN
    ? 'sent the signed-in user token — this is the 401 INVALID_OAUTHTOKEN bug'
    : `sent "${token}"`);

// Leaving the shared app in admin scope would make a later
// userManagement().getCurrentUser() resolve the wrong identity. On a role-gated
// PII system that is a privilege bug, so it is asserted, not assumed.
check('the credential scope is restored afterwards',
  credential.getCurrentUser() === 'user',
  `currentUser=${credential.getCurrentUser()}`);

check('project-context headers accompany the credential',
  headers['x-zc-project-key'] === 'PROJECT-KEY' && headers['x-zc-environment'] === 'Development',
  `x-zc-project-key=${headers['x-zc-project-key']} x-zc-environment=${headers['x-zc-environment']}`);

// A user-scoped app has no admin credential to offer. Failing loudly beats
// silently sending a token the endpoint will reject.
{
  const strict = new CatalystCredential({
    'x-zc-admin-cred-type': 'token',
    'x-zc-admin-cred-token': ADMIN_TOKEN,
    'x-zc-user-cred-type': 'token',
    'x-zc-user-cred-token': USER_TOKEN,
    'x-zc-user-type': 'user',
  }, 'user');

  let threw = null;
  try {
    await withApp(makeApp(strict), () => buildAuthHeaders(null, 'verify'));
  } catch (err) {
    threw = err;
  }
  check('a user-scoped app fails loudly instead of sending a user token',
    threw !== null && /admin credential|locked/i.test(threw.message),
    threw ? threw.message.slice(0, 90) : 'no error raised');
}

console.log(failures === 0 ? '\nALL PASS\n' : `\n${failures} FAILED\n`);
process.exit(failures === 0 ? 0 : 1);
