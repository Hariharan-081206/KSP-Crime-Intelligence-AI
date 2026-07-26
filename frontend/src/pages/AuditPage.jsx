import PanelHeader from '../components/common/PanelHeader'
import RoleGate from '../components/common/RoleGate'
import AuditLogList from '../components/audit/AuditLogList'
import AggregateStats from '../components/audit/AggregateStats'
import ThresholdEditor from '../components/audit/ThresholdEditor'
import { useAuth } from '../context/AuthContext'
import { ROLES } from '../utils/roles'
import { useAsync } from '../hooks/useAsync'
import { getAuditLog } from '../api/services/auditService'
import './AuditPage.css'

export default function AuditPage() {
  const { role, name } = useAuth()
  const { data, loading, error } = useAsync(() => getAuditLog(), [])

  const entries = Array.isArray(data) ? data : data?.entries ?? []
  const aggregate = data?.aggregate ?? []
  // Investigators/Policymakers see only their own queries; Analysts see all.
  const visibleEntries =
    role === ROLES.ANALYST ? entries : entries.filter((e) => e.role === role)

  return (
    <div className="audit-page">
      <PanelHeader title="Audit Log & Settings" />
      <div className="audit-page-body">
        <RoleGate feature="audit-aggregate">
          {aggregate.length > 0 && <AggregateStats stats={aggregate} />}
        </RoleGate>

        <RoleGate feature="threshold-edit">
          <ThresholdEditor />
        </RoleGate>

        <div className="audit-page-log">
          <span className="audit-page-log-title">
            {role === ROLES.ANALYST ? 'All Queries & Actions' : `Your Activity — ${name}`}
          </span>
          {loading && <p className="audit-page-state">Loading activity…</p>}
          {!loading && error && (
            <p className="audit-page-state">Audit log is currently unavailable.</p>
          )}
          {!loading && !error && visibleEntries.length === 0 && (
            <p className="audit-page-state">No activity recorded.</p>
          )}
          {!loading && !error && visibleEntries.length > 0 && (
            <AuditLogList entries={visibleEntries} />
          )}
        </div>
      </div>
    </div>
  )
}
