import { Polygon } from 'react-leaflet'
import { KARNATAKA_OUTLINE } from './mapGeometry'

const WORLD_RING = [
  [-85, -180],
  [-85, 180],
  [85, 180],
  [85, -180],
]

const MASK_STYLE = {
  stroke: true,
  color: '#6B2A5F',
  weight: 1.5,
  fillColor: '#1A0F19',
  fillOpacity: 0.55,
}

// Dims everything outside the Karnataka outline so neighboring states recede
// visually, while zoom/bounds stay wide enough to show all incident data.
export default function StateMask() {
  return (
    <Polygon positions={[WORLD_RING, KARNATAKA_OUTLINE]} pathOptions={MASK_STYLE} interactive={false} />
  )
}
