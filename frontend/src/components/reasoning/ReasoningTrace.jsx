import './ReasoningTrace.css'

export default function ReasoningTrace({ steps }) {
  if (!steps?.length) return null
  return (
    <ol className="reasoning-trace">
      {steps.map((step, idx) => (
        <li key={step.stage} className="reasoning-trace-step">
          <span className="reasoning-trace-index">{idx + 1}</span>
          <div className="reasoning-trace-body">
            <span className="reasoning-trace-stage">{step.stage}</span>
            <span className="reasoning-trace-label">{step.label}</span>
          </div>
        </li>
      ))}
    </ol>
  )
}
