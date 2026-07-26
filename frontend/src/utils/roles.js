export const ROLES = {
  POLICYMAKER: 'policymaker',
  INVESTIGATOR: 'investigator',
  ANALYST: 'analyst',
}

export const ROLE_LABELS = {
  [ROLES.POLICYMAKER]: 'Policymaker',
  [ROLES.INVESTIGATOR]: 'Investigator',
  [ROLES.ANALYST]: 'Analyst',
}

// Feature keys checked against a role via RoleGate / route guards.
export const ROLE_PERMISSIONS = {
  // Policymaker reaches /profile for the aggregate-only view (no PII, no
  // per-individual rows) — BehavioralProfile branches on role to render it.
  [ROLES.POLICYMAKER]: ['map', 'alerts', 'export', 'audit-own', 'profile'],
  [ROLES.INVESTIGATOR]: ['map', 'network', 'alerts', 'profile', 'export', 'case-detail', 'reasoning', 'audit-own'],
  [ROLES.ANALYST]: ['map', 'alerts', 'profile', 'export', 'forecast', 'threshold-edit', 'reasoning', 'audit-own', 'audit-aggregate'],
}

export function roleCan(role, feature) {
  if (!role) return false
  return ROLE_PERMISSIONS[role]?.includes(feature) ?? false
}

export const ROLE_COLOR_VAR = {
  [ROLES.POLICYMAKER]: 'var(--color-role-policymaker)',
  [ROLES.INVESTIGATOR]: 'var(--color-role-investigator)',
  [ROLES.ANALYST]: 'var(--color-role-analyst)',
}

/**
 * Maps a role name from the backend onto this app's role key.
 *
 * REQUIRED, not cosmetic. The keys above are lowercase and every gate in the app
 * (ROLE_PERMISSIONS, roleCan, RequireRole, ROLE_COLOR_VAR) looks them up by that
 * exact string — but GET /auth/role returns the Catalyst console's capitalised
 * name ("Investigator"). Assigning that straight into auth state makes
 * roleCan() miss on every feature, so the user signs in successfully and then
 * sees nothing. Normalise at the boundary instead.
 *
 * Case- and separator-insensitive, mirroring the backend's normalizeRoleName so
 * both ends tolerate the same spellings.
 *
 * @param {unknown} rawRole
 * @returns {string|null} one of ROLES, or null if unrecognised
 */
export function normalizeRole(rawRole) {
  if (typeof rawRole !== 'string') return null
  const key = rawRole.replace(/[\s_-]+/g, '').toLowerCase()
  if (key === 'policymaker') return ROLES.POLICYMAKER
  if (key === 'investigator') return ROLES.INVESTIGATOR
  if (key === 'analyst') return ROLES.ANALYST
  return null
}
