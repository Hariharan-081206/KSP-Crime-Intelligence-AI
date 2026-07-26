import './AuditLogList.css'

export default function AuditLogList({ entries }) {
  return (
    <div className="audit-log-list">
      {entries.map((entry) => (
        <div key={entry.id} className="audit-log-row">
          <div className="audit-log-row-main">
            <span className="audit-log-action">{entry.action}</span>
            <span className="audit-log-detail">{entry.detail}</span>
          </div>
          <div className="audit-log-row-meta">
            <span>{entry.actor}</span>
            <span>{new Date(entry.timestamp).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
          </div>
        </div>
      ))}
    </div>
  )
}
