#!/usr/bin/env node
/**
 * Guards the role-name boundary between the backend and this app.
 *
 * WHY THIS EXISTS: the app's ROLES keys are lowercase ('investigator') and every
 * gate — ROLE_PERMISSIONS, roleCan, RequireRole, ROLE_COLOR_VAR — looks them up
 * by that exact string. GET /auth/role returns the Catalyst console's
 * capitalisation ('Investigator'). Assigning the backend value straight into auth
 * state makes roleCan() miss on EVERY feature, so the user signs in successfully
 * and then sees an app with nothing in it — no error, no clue. That is precisely
 * the bug this file exists to prevent from coming back.
 *
 * Run: node scripts/check-role-mapping.mjs      (exit 0 = pass)
 */

import { normalizeRole, ROLES, roleCan } from '../src/utils/roles.js'

let failures = 0

function check(label, got, want) {
  const ok = got === want
  if (!ok) failures++
  console.log(
    `${ok ? 'PASS' : 'FAIL'}  ${label} -> ${JSON.stringify(got)}` +
      (ok ? '' : `  (want ${JSON.stringify(want)})`),
  )
}

// --- What the backend actually sends (Catalyst console capitalisation) -------
check("normalizeRole('Investigator')", normalizeRole('Investigator'), ROLES.INVESTIGATOR)
check("normalizeRole('Policymaker')", normalizeRole('Policymaker'), ROLES.POLICYMAKER)
check("normalizeRole('Analyst')", normalizeRole('Analyst'), ROLES.ANALYST)

// --- Spelling tolerance, mirroring the backend's normalizeRoleName -----------
check("normalizeRole('policy maker')", normalizeRole('policy maker'), ROLES.POLICYMAKER)
check("normalizeRole('POLICY_MAKER')", normalizeRole('POLICY_MAKER'), ROLES.POLICYMAKER)
check("normalizeRole('investigator')", normalizeRole('investigator'), ROLES.INVESTIGATOR)

// --- Catalyst's built-in roles are NOT SCRB roles ---------------------------
check("normalizeRole('App User')", normalizeRole('App User'), null)
check("normalizeRole('App Administrator')", normalizeRole('App Administrator'), null)
check('normalizeRole(null)', normalizeRole(null), null)
check('normalizeRole(undefined)', normalizeRole(undefined), null)
check('normalizeRole(42)', normalizeRole(42), null)

// --- The regression itself ---------------------------------------------------
// Raw backend value must fail to gate (documents the bug), normalized must work.
check("roleCan('Investigator', 'network')  [raw: the bug]", roleCan('Investigator', 'network'), false)
check("roleCan(normalized, 'network')      [fixed]", roleCan(normalizeRole('Investigator'), 'network'), true)

// --- Allow-lists still discriminate after normalization ---------------------
check("Analyst      -> 'forecast'  allowed", roleCan(normalizeRole('Analyst'), 'forecast'), true)
check("Investigator -> 'forecast'  denied ", roleCan(normalizeRole('Investigator'), 'forecast'), false)
check("Investigator -> 'network'   allowed", roleCan(normalizeRole('Investigator'), 'network'), true)
check("Policymaker  -> 'network'   denied ", roleCan(normalizeRole('Policymaker'), 'network'), false)
check("Analyst      -> 'network'   denied ", roleCan(normalizeRole('Analyst'), 'network'), false)
check("Policymaker  -> 'map'       allowed", roleCan(normalizeRole('Policymaker'), 'map'), true)
check('null role    -> anything    denied ', roleCan(null, 'map'), false)

console.log(`\n${failures === 0 ? 'ALL PASS' : `${failures} FAILURE(S)`}`)
process.exitCode = failures === 0 ? 0 : 1
