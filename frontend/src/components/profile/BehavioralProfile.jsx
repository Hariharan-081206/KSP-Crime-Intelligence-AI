import { useAuth } from '../../context/AuthContext'
import { maskForRole } from '../../utils/maskForRole'
import { getEscalationView, isEscalated } from '../../utils/getEscalationView'
import { ROLES } from '../../utils/roles'
import './BehavioralProfile.css'

// Build the escalation record set for the helper. Prefer a backend-provided
// cohort (cluster members) so the analyst aggregate is meaningful; otherwise
// fall back to the single subject.
function buildEscalationRecords(profile) {
  if (Array.isArray(profile.cohort) && profile.cohort.length > 0) {
    return profile.cohort.map((m) => ({
      id: m.id ?? m.accusedId,
      escalationRisk: m.escalationRisk ?? m.escalation_risk,
      cluster: m.cluster ?? m.clusterLabel,
    }))
  }
  return [
    {
      id: profile.accusedId,
      escalationRisk: profile.escalationRisk ?? profile.escalation_risk ?? null,
      cluster: profile.cluster ?? profile.clusterLabel ?? null,
    },
  ]
}

function EscalationLevelChip({ risk }) {
  if (!risk) return null
  const level = typeof risk === 'boolean' ? (risk ? 'high' : 'low') : risk
  return <span className={`escalation-chip escalation-${level}`}>Escalation risk: {level}</span>
}

// Per-role escalation surface for the individual profile (investigator vs
// analyst). Policymaker never reaches this branch — see the aggregate view.
function EscalationSection({ role, records, hasCohort }) {
  const { mode, payload } = getEscalationView(role, records)
  if (mode === 'hidden') return null

  if (mode === 'per-individual') {
    const self = records[0]
    return (
      <div className="escalation-section">
        <span className="escalation-section-title">Escalation flag</span>
        {isEscalated(self?.escalationRisk) ? (
          <EscalationLevelChip risk={self.escalationRisk} />
        ) : (
          <span className="escalation-none">No active escalation flag for this individual.</span>
        )}
      </div>
    )
  }

  // analyst — aggregate only, never per-individual
  return (
    <div className="escalation-section">
      <span className="escalation-section-title">Escalation (aggregate)</span>
      {hasCohort && payload.length > 0 ? (
        <ul className="escalation-aggregate-list">
          {payload.map((c) => (
            <li key={c.cluster}>
              <strong>{c.pct}%</strong> of {c.cluster} show escalation ({c.flagged}/{c.total})
            </li>
          ))}
        </ul>
      ) : (
        <span className="escalation-none">Cluster-level escalation statistics not yet available.</span>
      )}
    </div>
  )
}

// Policymaker aggregate-only view: cluster counts + district-level escalation
// percentages. No accused rows, no PII. `maskedName` exercises the policymaker
// branch of maskForRole (renders "Aggregate view only").
function AggregateProfileView({ aggregate, maskedName }) {
  const clusters = aggregate?.clusters ?? []
  const districtEscalation = aggregate?.districtEscalation ?? aggregate?.district_escalation ?? []
  const hasData = clusters.length > 0 || districtEscalation.length > 0

  return (
    <div className="behavioral-profile">
      <div className="behavioral-profile-header">
        <span className="behavioral-profile-name">{maskedName}</span>
        <span className="behavioral-profile-id">Policymaker · aggregate statistics</span>
      </div>

      {!hasData ? (
        <p className="behavioral-profile-restricted">
          Individual-level behavioral profiles are not available in the Policymaker view. Aggregate
          offense-pattern statistics are not yet available from the backend.
        </p>
      ) : (
        <div className="aggregate-view">
          {clusters.length > 0 && (
            <div className="aggregate-block">
              <span className="aggregate-block-title">Behavioral clusters</span>
              <div className="aggregate-cluster-list">
                {clusters.map((c) => (
                  <div key={c.label ?? c.cluster} className="aggregate-cluster-row">
                    <span>{c.label ?? c.cluster}</span>
                    <span className="aggregate-cluster-count">{c.count}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          {districtEscalation.length > 0 && (
            <div className="aggregate-block">
              <span className="aggregate-block-title">District escalation</span>
              <div className="aggregate-cluster-list">
                {districtEscalation.map((d) => (
                  <div key={d.district} className="aggregate-cluster-row">
                    <span>{d.district}</span>
                    <span className="aggregate-cluster-count">{d.pct ?? d.percentage}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function BehavioralProfile({ profile }) {
  const { role } = useAuth()

  // Policymaker: aggregate-only, no PII. maskForRole here yields the policymaker
  // placeholder, keeping that masking branch exercised.
  if (role === ROLES.POLICYMAKER) {
    return (
      <AggregateProfileView
        aggregate={profile.aggregate}
        maskedName={maskForRole(profile.name, role, { idSeed: profile.accusedId })}
      />
    )
  }

  // Investigator (real values) / analyst (hashed pseudonym).
  // TODO(security): client-side masking only — production masking belongs server-side.
  const displayName = maskForRole(profile.name, role, { idSeed: profile.accusedId })
  const hasCohort = Array.isArray(profile.cohort) && profile.cohort.length > 0
  const escalationRecords = buildEscalationRecords(profile)

  return (
    <div className="behavioral-profile">
      <div className="behavioral-profile-header">
        <span className="behavioral-profile-name">{displayName}</span>
        <span className="behavioral-profile-id">{maskForRole(profile.accusedId, role, { idSeed: profile.accusedId })}</span>
      </div>

      <div className="profile-row-list">
        {(profile.rows ?? []).map((row) => (
          <div key={row.label} className="profile-row">
            <span className="profile-row-label">{row.label}</span>
            <span className="profile-row-value">{row.value}</span>
          </div>
        ))}
      </div>

      <EscalationSection role={role} records={escalationRecords} hasCohort={hasCohort} />
    </div>
  )
}
