// File: backend/utils/constants.js

export const ROLES = Object.freeze({
  POLICYMAKER: 'Policymaker',
  INVESTIGATOR: 'Investigator',
  ANALYST: 'Analyst'
});

export const ALL_ROLES = Object.values(ROLES);

/**
 * Maps a Catalyst *native* role name onto one of the three ROLES above.
 *
 * Roles are configured in the Catalyst console under Authentication →
 * Manage Application Users → Roles, and arrive on every request inside the
 * session as `getCurrentUser().role_details.role_name`. There is no `UserRoles`
 * Data Store table any more — the console is the single source of truth.
 *
 * Matching is case- and separator-insensitive so a role typed as `policymaker`,
 * `POLICY_MAKER`, or `Policy Maker` in the console still resolves. Anything
 * unrecognised (including Catalyst's built-in `App User` / `App Administrator`)
 * returns null, which roleMiddleware turns into a 403 naming the role.
 */
export function normalizeRoleName(rawRoleName) {
  if (typeof rawRoleName !== 'string') return null;

  const key = rawRoleName.replace(/[\s_-]+/g, '').toLowerCase();

  switch (key) {
    case 'policymaker':
      return ROLES.POLICYMAKER;
    case 'investigator':
      return ROLES.INVESTIGATOR;
    case 'analyst':
      return ROLES.ANALYST;
    default:
      return null;
  }
}

export const HTTP_STATUS = Object.freeze({
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  UNPROCESSABLE_ENTITY: 422,
  INTERNAL_ERROR: 500,
  NOT_IMPLEMENTED: 501,
  BAD_GATEWAY: 502
});

// RAG_CONFIG removed: it defaulted RAG_ENDPOINT to http://localhost:8000, which
// made a missing configuration look like a connection error to a dev server that
// does not exist in Catalyst. ragService now requires RAG_ANSWER_URL explicitly
// and returns 503 when it is unset.

// ASSUMPTION: table names — confirm against Section 8 schema
export const TABLES = Object.freeze({
  CRIME_RECORDS: 'CrimeRecords',
  CASE_FILES: 'CaseFiles',
  CONVERSATION_LOG: 'ConversationLog',
  QUERY_LOG: 'QueryLog',
  // USER_ROLES removed: roles come from the Catalyst session, not a table.
  ALERTS: 'Alerts'
});

export const CACHE_TTL_SECONDS = Object.freeze({
  DEFAULT: 300,
  ALERTS_FEED: 60,
  FORECAST: 900
});

export const PII_FIELDS = Object.freeze([
  'VICTIM_NAME',
  'VICTIM_CONTACT',
  'SUSPECT_NAME',
  'SUSPECT_CONTACT'
]);

export const AUDIT_STAGES = Object.freeze({
  INTENT_EXTRACTION_FAILED: 'INTENT_EXTRACTION_FAILED',
  INTENT_NOT_RESOLVED: 'INTENT_NOT_RESOLVED',
  DATASTORE_LOOKUP_FAILED: 'DATASTORE_LOOKUP_FAILED',
  SYNTHESIS_FAILED: 'SYNTHESIS_FAILED',
  COMPLETED: 'COMPLETED',
  EXPORTED: 'EXPORTED'
});