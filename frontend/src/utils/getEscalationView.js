import { ROLES } from './roles'

// Escalation-risk visibility is role-scoped (spec Section 5):
//   investigator -> per-individual flags on each accused
//   analyst      -> aggregate-only (cluster percentages), never per-individual
//   policymaker  -> not visible at the individual level at all
//
// Centralized here so BehavioralProfile, NetworkGraph, and any future surface
// branch on one helper instead of re-deriving the rules.

export function isEscalated(risk) {
  if (typeof risk === 'boolean') return risk
  return risk === 'high' || risk === 'medium'
}

function summarizeByCluster(records) {
  const byCluster = new Map()
  records.forEach((r) => {
    const cluster = r.cluster ?? 'Unclustered'
    const entry = byCluster.get(cluster) ?? { cluster, total: 0, flagged: 0 }
    entry.total += 1
    if (isEscalated(r.escalationRisk)) entry.flagged += 1
    byCluster.set(cluster, entry)
  })
  return [...byCluster.values()].map((e) => ({
    ...e,
    pct: e.total ? Math.round((e.flagged / e.total) * 100) : 0,
  }))
}

/**
 * @param {string} role
 * @param {Array<{ id?: string, escalationRisk?: string|boolean, cluster?: string }>} records
 * @returns {{ mode: 'per-individual'|'aggregate'|'hidden', payload: any }}
 */
export function getEscalationView(role, records = []) {
  if (role === ROLES.INVESTIGATOR) {
    return { mode: 'per-individual', payload: records }
  }
  if (role === ROLES.ANALYST) {
    return { mode: 'aggregate', payload: summarizeByCluster(records) }
  }
  return { mode: 'hidden', payload: null }
}
