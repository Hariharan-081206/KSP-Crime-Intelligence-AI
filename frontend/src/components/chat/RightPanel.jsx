import { useNavigate } from 'react-router-dom'
import { Maximize2 } from 'lucide-react'
import { useAuth } from '../../context/AuthContext'
import { roleCan } from '../../utils/roles'
import { useAsync } from '../../hooks/useAsync'
import { getNetwork } from '../../api/services/networkService'
import CrimeMap from '../map/CrimeMap'
import NetworkGraph from '../graph/NetworkGraph'
import './RightPanel.css'

export default function RightPanel() {
  const { role } = useAuth()
  const navigate = useNavigate()
  const canNetwork = roleCan(role, 'network')
  const { data: network, loading, error } = useAsync(
    () => (canNetwork ? getNetwork() : Promise.resolve(null)),
    [canNetwork],
  )
  const hasGraph = network?.nodes?.length > 0

  return (
    <div className="right-panel">
      {roleCan(role, 'map') && (
        <div className="right-panel-section">
          <div className="right-panel-section-header">
            <span>District Hotspot Map</span>
            <button className="right-panel-expand" onClick={() => navigate('/map')} type="button">
              <Maximize2 size={13} />
              Expand
            </button>
          </div>
          <CrimeMap compact />
        </div>
      )}

      <div className="right-panel-section">
        <div className="right-panel-section-header">
          <span>Criminal Network</span>
          {canNetwork && (
            <button className="right-panel-expand" onClick={() => navigate('/network')} type="button">
              <Maximize2 size={13} />
              Expand
            </button>
          )}
        </div>
        {!canNetwork && (
          <p className="right-panel-restricted">Network view is available to Investigator role only.</p>
        )}
        {canNetwork && loading && <p className="right-panel-restricted">Loading network…</p>}
        {canNetwork && !loading && (error || !hasGraph) && (
          <p className="right-panel-restricted">No network data available.</p>
        )}
        {canNetwork && !loading && !error && hasGraph && <NetworkGraph data={network} compact />}
      </div>
    </div>
  )
}
