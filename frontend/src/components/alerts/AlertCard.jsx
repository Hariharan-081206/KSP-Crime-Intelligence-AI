import './AlertCard.css'

const SEVERITY_LABEL = { high: 'High', medium: 'Medium', low: 'Low' }

export default function AlertCard({ alert }) {
  return (
    <div className={`alert-card severity-${alert.severity}`}>
      <div className="alert-card-top">
        <span className={`alert-severity-dot severity-${alert.severity}`} />
        <span className="alert-card-title">{alert.title}</span>
        <span className={`alert-severity-tag severity-${alert.severity}`}>{SEVERITY_LABEL[alert.severity]}</span>
      </div>
      <p className="alert-card-desc">{alert.description}</p>
      <div className="alert-card-meta">
        <span>{alert.district}</span>
        <span>{alert.crimeType}</span>
        <span>{new Date(alert.detectedAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</span>
      </div>
    </div>
  )
}
