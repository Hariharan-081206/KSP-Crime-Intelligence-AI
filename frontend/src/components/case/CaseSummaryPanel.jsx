import './CaseSummaryPanel.css'

export default function CaseSummaryPanel({ caseData }) {
  return (
    <div className="case-summary-panel">
      <div className="case-summary-top">
        <h2>{caseData.title}</h2>
        <span className="case-summary-status">{caseData.status}</span>
      </div>
      <p className="case-summary-id">{caseData.caseId} · Opened {caseData.openedAt}</p>
      <p className="case-summary-text">{caseData.summary}</p>
    </div>
  )
}
