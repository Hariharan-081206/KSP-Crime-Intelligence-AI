import AnimatedNumber from '../common/AnimatedNumber'
import './AggregateStats.css'

export default function AggregateStats({ stats }) {
  return (
    <div className="aggregate-stats">
      {stats.map((s) => (
        <div key={s.label} className="aggregate-stat-tile">
          <span className="aggregate-stat-value"><AnimatedNumber value={s.value} /></span>
          <span className="aggregate-stat-label">{s.label}</span>
        </div>
      ))}
    </div>
  )
}
