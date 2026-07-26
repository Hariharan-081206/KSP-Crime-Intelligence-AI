import { useState } from 'react'
import PanelHeader from '../components/common/PanelHeader'
import ExportButton from '../components/common/ExportButton'
import RoleGate from '../components/common/RoleGate'
import ForecastPanel from '../components/forecast/ForecastPanel'
import AlertsList from '../components/alerts/AlertsList'
import { useAsync } from '../hooks/useAsync'
import { getActiveAlerts } from '../api/services/alertsService'
import { useInvestigation } from '../context/InvestigationContext'
import './AlertsPage.css'

export default function AlertsPage() {
  const { data, loading, error, reload } = useAsync(() => getActiveAlerts(), [])
  const { districts } = useInvestigation()
  // When the investigation stack names districts, scope alerts to that union
  // (§4). A toggle lets the user drop back to all active alerts.
  const [scoped, setScoped] = useState(true)

  const allAlerts = Array.isArray(data) ? data : data?.alerts ?? []
  const filtering = scoped && districts.length > 0
  const alerts = filtering
    ? allAlerts.filter((a) => a.district && districts.includes(a.district))
    : allAlerts

  return (
    <div className="alerts-page">
      <PanelHeader title="Early-Warning Alerts" actions={<ExportButton scope="alerts" />} />
      <div className="alerts-page-body">
        <RoleGate feature="forecast">
          <ForecastPanel />
        </RoleGate>

        {districts.length > 0 && (
          <div className="alerts-scope">
            <span>
              {filtering
                ? `Scoped to investigation: ${districts.join(', ')}`
                : 'Showing all districts'}
            </span>
            <button type="button" onClick={() => setScoped((v) => !v)}>
              {filtering ? 'Show all' : 'Scope to investigation'}
            </button>
          </div>
        )}

        {loading && <p className="alerts-page-state">Loading alerts…</p>}
        {!loading && error && (
          <div className="alerts-page-state alerts-page-state-error">
            <p>Could not load active alerts.</p>
            <button type="button" onClick={reload}>Retry</button>
          </div>
        )}
        {!loading && !error && alerts.length === 0 && (
          <p className="alerts-page-state">
            {filtering ? 'No active alerts for the districts in this investigation.' : 'No active alerts at this time.'}
          </p>
        )}
        {!loading && !error && alerts.length > 0 && <AlertsList alerts={alerts} />}
      </div>
    </div>
  )
}
