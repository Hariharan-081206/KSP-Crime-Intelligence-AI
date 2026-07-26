import karnatakaOutlineLatLng from '../../assets/karnataka-outline.json'

// -----------------------------------------------------------------------------
// Map RENDERING geometry (not mock data). These are real Karnataka GIS assets
// and pure styling constants used to draw the map; the incident/hotspot DATA
// they were formerly seeded with now comes from the live API (mapService).
// -----------------------------------------------------------------------------

// Real Karnataka state boundary, simplified (Douglas-Peucker) from
// src/assets/karnataka-outline.json. Already [lat, lng] for Leaflet <Polygon>.
export const KARNATAKA_OUTLINE = karnatakaOutlineLatLng

const OUTLINE_LATS = KARNATAKA_OUTLINE.map((p) => p[0])
const OUTLINE_LNGS = KARNATAKA_OUTLINE.map((p) => p[1])
const MIN_LAT = Math.min(...OUTLINE_LATS)
const MAX_LAT = Math.max(...OUTLINE_LATS)
const MIN_LNG = Math.min(...OUTLINE_LNGS)
const MAX_LNG = Math.max(...OUTLINE_LNGS)

// A little padding so the outline isn't flush against the viewport edge.
const PAD = 0.35
export const KARNATAKA_BOUNDS = [
  [MIN_LAT - PAD, MIN_LNG - PAD],
  [MAX_LAT + PAD, MAX_LNG + PAD],
]
export const MAP_CENTER = [(MIN_LAT + MAX_LAT) / 2, (MIN_LNG + MAX_LNG) / 2]

// Real per-district boundaries now load directly in DistrictOutlines from the
// full-resolution src/assets/karnataka-districts.geojson (fetched at runtime via
// a Vite ?url import), superseding the former simplified district outlines.

// Shared green→yellow→red density ramp (heatmap + legend gradient bar).
export const DENSITY_GRADIENT = [
  { stop: 0, color: '#2E7D32' },
  { stop: 0.5, color: '#FBC02D' },
  { stop: 1, color: '#C62828' },
]

// Deterministic PRNG so heatmap density is stable across reloads without
// hand-listing thousands of points.
function mulberry32(seed) {
  let a = seed
  return function () {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/**
 * Expand sparse per-district counts + hotspots into a stable heat point cloud.
 * Pure rendering helper: feed it LIVE data from the API. Returns [] when there
 * is nothing to render (empty/failed response) so the map degrades gracefully.
 *
 * @param {Array<{ lat: number, lng: number, count: number }>} districts
 * @param {Array<{ lat: number, lng: number, severity?: string }>} hotspots
 * @param {number} [seed]
 * @returns {Array<[number, number, number]>} [lat, lng, intensity] triples.
 */
export function buildHeatPoints(districts = [], hotspots = [], seed = 42) {
  const rand = mulberry32(seed)
  const points = []

  districts.forEach(({ lat, lng, count = 0 }) => {
    if (lat == null || lng == null) return
    const pointCount = Math.max(20, Math.round(count / 4))
    for (let i = 0; i < pointCount; i++) {
      const spread = 0.35
      const dLat = (rand() - 0.5) * spread
      const dLng = (rand() - 0.5) * spread
      const intensity = 0.4 + rand() * 0.6
      points.push([lat + dLat, lng + dLng, intensity])
    }
  })

  hotspots.forEach((h) => {
    if (h.lat == null || h.lng == null) return
    const boost = h.severity === 'high' ? 24 : h.severity === 'medium' ? 14 : 8
    for (let i = 0; i < boost; i++) {
      const dLat = (rand() - 0.5) * 0.12
      const dLng = (rand() - 0.5) * 0.12
      points.push([h.lat + dLat, h.lng + dLng, 0.75 + rand() * 0.25])
    }
  })

  return points
}
