import './InvestigationTimeline.css'

export default function InvestigationTimeline({ timeline }) {
  return (
    <div className="investigation-timeline">
      <span className="investigation-timeline-title">Investigation Timeline</span>
      <ol className="investigation-timeline-list">
        {timeline.map((step, idx) => (
          <li key={step.date + step.label} className="investigation-timeline-step">
            <div className="investigation-timeline-marker">
              <span className="investigation-timeline-dot" />
              {idx < timeline.length - 1 && <span className="investigation-timeline-line" />}
            </div>
            <div className="investigation-timeline-body">
              <span className="investigation-timeline-date">{step.date}</span>
              <span className="investigation-timeline-label">{step.label}</span>
              <span className="investigation-timeline-detail">{step.detail}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  )
}
