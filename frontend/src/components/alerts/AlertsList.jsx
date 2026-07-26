import AlertCard from './AlertCard'
import './AlertsList.css'

export default function AlertsList({ alerts }) {
  if (!alerts?.length) {
    return <p className="alerts-list-empty">No alerts match the current filters.</p>
  }
  return (
    <div className="alerts-list">
      {alerts.map((alert) => (
        <AlertCard key={alert.id} alert={alert} />
      ))}
    </div>
  )
}
