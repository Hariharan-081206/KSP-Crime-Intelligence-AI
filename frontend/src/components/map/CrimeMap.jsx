import { useMemo } from 'react'
import { MapContainer, TileLayer } from 'react-leaflet'
import StateMask from './StateMask'
import HeatmapLayer from './HeatmapLayer'
import DistrictOutlines from './DistrictOutlines'
import HotspotMarkers from './HotspotMarkers'
import MapLegend from './MapLegend'
import { MAP_CENTER, KARNATAKA_BOUNDS, buildHeatPoints } from './mapGeometry'
import { useAsync } from '../../hooks/useAsync'
import { getHotspots, getDemographic } from '../../api/services/mapService'
import './CrimeMap.css'

export default function CrimeMap({ compact = false, onDistrictHover, onDistrictClick, pinnedId = null, highlightDistricts = [] }) {
  const { data: hotspots, error: hotspotsError } = useAsync(() => getHotspots(), [])
  const { data: demographic } = useAsync(() => getDemographic(), [])

  const hotspotList = useMemo(
    () => (Array.isArray(hotspots) ? hotspots : []),
    [hotspots],
  )
  const heatPoints = useMemo(() => {
    const districtList = Array.isArray(demographic) ? demographic : demographic?.districts ?? []
    return buildHeatPoints(districtList, hotspotList)
  }, [demographic, hotspotList])

  return (
    <div className={`crime-map ${compact ? 'compact' : ''}`}>
      <MapContainer
        center={MAP_CENTER}
        zoom={compact ? 6.5 : 7.3}
        minZoom={compact ? 6.5 : 7}
        maxZoom={10}
        maxBounds={KARNATAKA_BOUNDS}
        maxBoundsViscosity={1}
        zoomControl={!compact}
        dragging={!compact}
        scrollWheelZoom={!compact}
        doubleClickZoom={!compact}
        zoomSnap={0.5}
        style={{ height: '100%', width: '100%', background: 'var(--color-bg)' }}
      >
        <TileLayer
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
        />
        <StateMask />
        <HeatmapLayer points={heatPoints} />
        <DistrictOutlines
          onDistrictHover={onDistrictHover}
          onDistrictClick={onDistrictClick}
          pinnedId={pinnedId}
          interactive={!compact}
          highlightDistricts={highlightDistricts}
        />
        <HotspotMarkers hotspots={hotspotList} />
      </MapContainer>
      {!compact && <MapLegend />}
      {!compact && hotspotsError && (
        <div className="crime-map-notice" role="status">
          Live hotspot data unavailable — showing base map only.
        </div>
      )}
    </div>
  )
}
