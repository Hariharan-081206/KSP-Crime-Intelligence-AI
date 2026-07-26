import { ROLES } from './roles'

function hashId(value) {
  let hash = 0
  const str = String(value)
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i)
    hash |= 0
  }
  return Math.abs(hash).toString(16).slice(0, 8).padStart(8, '0')
}

// Analyst sees a stable hashed ID instead of a real name.
// Policymaker sees aggregate-only placeholder, no individual identifier at all.
// Investigator sees the real value.
//
// TODO(security): this is a UI convenience only — the real (unmasked) values
// still travel to the browser. Production masking MUST happen server-side per
// role so the client never receives PII the role isn't entitled to. Keep this
// helper for demo resilience but do not treat it as an access-control boundary.
export function maskForRole(value, role, { idSeed } = {}) {
  if (role === ROLES.POLICYMAKER) return 'Aggregate view only'
  if (role === ROLES.ANALYST) return `AccusedID_${hashId(idSeed ?? value)}`
  return value
}
