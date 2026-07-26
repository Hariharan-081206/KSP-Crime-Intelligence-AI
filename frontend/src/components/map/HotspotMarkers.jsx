import { CircleMarker, Tooltip } from 'react-leaflet'

const SEVERITY_HEX = {
  high: '#D32F2F',
  medium: '#F57C00',
  low: '#388E3C',
}

// `hotspots` come from the live API (mapService.getHotspots), which normalises
// the backend's district aggregates into { lat, lng, ... }. The coordinate guard
// is deliberate belt-and-braces: Leaflet throws `Invalid LatLng object` from
// inside render for a non-numeric pair, and an uncaught throw there blanks the
// view rather than dropping one marker. Empty → nothing.
export default function HotspotMarkers({ hotspots = [] }) {
  const plottable = hotspots.filter(
    (h) => Number.isFinite(Number(h?.lat)) && Number.isFinite(Number(h?.lng)),
  )

  return (
    <>
      {plottable.map((hotspot) => (
        <CircleMarker
          key={hotspot.id ?? `${hotspot.lat},${hotspot.lng}`}
          center={[Number(hotspot.lat), Number(hotspot.lng)]}
          radius={8}
          pathOptions={{
            color: '#1A1A00',
            fillColor: SEVERITY_HEX[hotspot.severity] ?? SEVERITY_HEX.low,
            fillOpacity: 0.9,
            weight: 1.5,
          }}
        >
          <Tooltip>{hotspot.label}</Tooltip>
        </CircleMarker>
      ))}
    </>
  )
}
