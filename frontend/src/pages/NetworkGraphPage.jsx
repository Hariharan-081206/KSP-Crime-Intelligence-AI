import PanelHeader from '../components/common/PanelHeader'
import ExportButton from '../components/common/ExportButton'
import NetworkGraph from '../components/graph/NetworkGraph'
import NetworkLegend from '../components/graph/NetworkLegend'
import { useAsync } from '../hooks/useAsync'
import { getNetwork } from '../api/services/networkService'
import { useInvestigation } from '../context/InvestigationContext'
import './NetworkGraphPage.css'

export default function NetworkGraphPage() {
  // Re-render the graph around the chat's active case/accused context (§4). The
  // backend receives these as filter params; when absent the full graph loads.
  const { activeCaseId, activeAccusedId } = useInvestigation()
  const params = {}
  if (activeCaseId) params.caseId = activeCaseId
  if (activeAccusedId) params.accusedId = activeAccusedId

  const { data, loading, error, reload } = useAsync(
    () => getNetwork(params),
    [activeCaseId, activeAccusedId],
  )
  const hasGraph = data?.nodes?.length > 0

  return (
    <div className="network-page">
      <PanelHeader
        title="Criminal Network"
        actions={<ExportButton scope="network" />}
      />
      <div className="network-page-body">
        {loading && <div className="network-page-state">Loading network…</div>}
        {!loading && error && (
          <div className="network-page-state network-page-state-error">
            <p>Could not load the network graph.</p>
            <button type="button" onClick={reload}>Retry</button>
          </div>
        )}
        {!loading && !error && !hasGraph && (
          <div className="network-page-state">No network connections to display.</div>
        )}
        {!loading && !error && hasGraph && <NetworkGraph data={data} />}
      </div>
      {hasGraph && <NetworkLegend />}
    </div>
  )
}
