import { useEffect } from 'react'
import { useMap } from 'react-leaflet'
import L from 'leaflet'
import 'leaflet.heat'
import { DENSITY_GRADIENT } from './mapGeometry'

const HEAT_GRADIENT = Object.fromEntries(DENSITY_GRADIENT.map((g) => [g.stop, g.color]))

// `points` are [lat, lng, intensity] triples built from live API data by the
// parent (mapGeometry.buildHeatPoints). Empty array → nothing rendered.
export default function HeatmapLayer({ points = [] }) {
  const map = useMap()

  useEffect(() => {
    if (!points.length) return undefined
    const heatLayer = L.heatLayer(points, {
      radius: 24,
      blur: 20,
      max: 1,
      minOpacity: 0.35,
      gradient: HEAT_GRADIENT,
    }).addTo(map)

    return () => map.removeLayer(heatLayer)
  }, [map, points])

  return null
}
