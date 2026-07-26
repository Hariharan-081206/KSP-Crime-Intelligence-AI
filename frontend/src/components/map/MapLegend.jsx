import { DENSITY_GRADIENT } from './mapGeometry'
import './MapLegend.css'

const GRADIENT_CSS = `linear-gradient(to right, ${DENSITY_GRADIENT.map((g) => `${g.color} ${g.stop * 100}%`).join(', ')})`

export default function MapLegend() {
  return (
    <div className="map-legend">
      <span className="map-legend-title">Incident density</span>
      <p className="map-legend-hint">Darker/warmer areas indicate a higher concentration of reported incidents.</p>
      <div className="map-legend-gradient-bar" style={{ background: GRADIENT_CSS }} />
      <div className="map-legend-gradient-labels">
        <span>Low</span>
        <span>Severe</span>
      </div>
      <div className="map-legend-hotspot">
        <span className="map-legend-hotspot-dot" />
        <span>Reported hotspot</span>
      </div>
    </div>
  )
}
