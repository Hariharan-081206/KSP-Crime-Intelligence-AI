import { useState } from 'react'
import PanelHeader from '../components/common/PanelHeader'
import ExportButton from '../components/common/ExportButton'
import CrimeMap from '../components/map/CrimeMap'
import DistrictDetailCard from '../components/map/DistrictDetailCard'
import { useAuth } from '../context/AuthContext'
import { useInvestigation } from '../context/InvestigationContext'
import './MapPage.css'

// TODO-BACKEND: the district detail card expects an endpoint that is not yet
// confirmed in scrb-backend/functions/scrb-backend/routes/mapRoutes.js:
//
//   GET /api/map/district/:districtId
//   -> {
//        districtId, districtName, totalIncidents,
//        topCrimeTypes: [{ code, count }], activeAlerts,
//        forecastNext7d, dominantCluster, lastUpdated
//      }
//
// Auth flows through apiClient (X-Auth-Token interceptor). Until the route
// lands the card renders a graceful "District data not yet available from
// backend" state on 404. No backend code is added or modified here.

export default function MapPage() {
  const { role } = useAuth()
  const { districts } = useInvestigation() // highlight the investigation's districts (§4)
  // `active` = the district whose card is shown; persists until another district
  // is hovered/clicked (not cleared on mouseout). `pinned` = clicked open.
  const [active, setActive] = useState(null)
  const [pinned, setPinned] = useState(false)

  const handleHover = (id, name) => {
    if (pinned) return // a pinned card stays until explicitly closed
    setActive({ id, name })
  }

  const handleClick = (id, name) => {
    setActive({ id, name })
    setPinned(true)
  }

  const handleClose = () => {
    setPinned(false)
    setActive(null)
  }

  return (
    <div className="map-page">
      <PanelHeader title="Crime Map — Karnataka" actions={<ExportButton scope="map" />} />
      <div className="map-page-body">
        <CrimeMap
          onDistrictHover={handleHover}
          onDistrictClick={handleClick}
          pinnedId={pinned ? active?.id : null}
          highlightDistricts={districts}
        />
        {active && (
          <DistrictDetailCard district={active} role={role} pinned={pinned} onClose={handleClose} />
        )}
      </div>
    </div>
  )
}
