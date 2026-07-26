import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

// The backend groups casemaster rows by district and returns
// `{ district, crimeCount, latitude, longitude }` (services/mapService.js
// getCrimeHotspots). The map components consume `{ id, lat, lng, label,
// severity }`. Nothing reconciled the two, so `hotspot.lat` was undefined and
// Leaflet threw `Invalid LatLng object: (undefined, undefined)` out of render,
// taking the whole app down with it. Normalise at the boundary — the same
// approach normalizeRole() takes for role names.
//
// Both spellings are accepted so this keeps working if the backend is changed
// to emit lat/lng directly.
function normalizeHotspot(raw, maxCount) {
  const lat = Number(raw?.lat ?? raw?.latitude)
  const lng = Number(raw?.lng ?? raw?.longitude)
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null

  const count = Number(raw?.crimeCount ?? raw?.count ?? 0) || 0
  const label = raw?.label ?? raw?.district ?? 'Unknown district'

  return {
    id: raw?.id ?? raw?.district ?? `${lat},${lng}`,
    lat,
    lng,
    count,
    label: count ? `${label} — ${count} case${count === 1 ? '' : 's'}` : label,
    // PROVISIONAL. The backend sends a raw count, not a severity, and there is
    // no agreed threshold yet — this ranks each district against the busiest one
    // in the same response so the markers carry information. Without it every
    // marker falls back to green, which on a crime map reads as a claim that
    // nowhere is a hotspot. Replace with real thresholds when defined.
    severity: raw?.severity ?? (count >= maxCount * 0.66 ? 'high' : count >= maxCount * 0.33 ? 'medium' : 'low'),
  }
}

/**
 * Fetch crime hotspots, aggregated per district by the backend.
 * @returns {Promise<Array<{ id: string, lat: number, lng: number, count: number, label: string, severity: 'high'|'medium'|'low' }>>}
 */
export async function getHotspots(params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.mapHotspots, { params })
  if (!Array.isArray(data)) return []
  const maxCount = data.reduce((m, r) => Math.max(m, Number(r?.crimeCount ?? r?.count ?? 0) || 0), 0)
  return data.map((raw) => normalizeHotspot(raw, maxCount)).filter(Boolean)
}

/**
 * Fetch per-district demographic / density insights for the choropleth toggle.
 * @returns {Promise<Array<{ district: string, lat?: number, lng?: number, count: number }>>}
 * TODO: confirm shape against API Gateway.
 */
export async function getDemographic(params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.insightsDemographic, { params })
  return data
}

/**
 * Fetch the detail card payload for a single district (hover/click on the map).
 * @param {string|number} districtId
 * @returns {Promise<{
 *   districtId: string, districtName: string, totalIncidents: number,
 *   topCrimeTypes: Array<{ code: string, count: number }>, activeAlerts: number,
 *   forecastNext7d: number|string, dominantCluster: string, lastUpdated: string
 * }>}
 * TODO-BACKEND: confirm route + shape (see ENDPOINTS.mapDistrict).
 */
export async function getDistrictDetail(districtId, params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.mapDistrict(districtId), { params })
  return data
}
