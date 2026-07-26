import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Fetch audit-log entries for the audit view.
 *
 * ⚠ Stage 2 §8 does not define a GET audit-log endpoint (only POST
 * /api/audit/log for manual logging). This reads from a placeholder path and
 * the view degrades to an empty state until the backend exposes one.
 * TODO: confirm the real read endpoint + response shape against API Gateway.
 *
 * @returns {Promise<{ entries: Array<{ id: string, actor: string, role: string, action: string, detail: string, timestamp: number|string }>, aggregate?: Array<{ label: string, value: number }> }>}
 */
export async function getAuditLog(params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.auditLog, { params })
  return data
}

/**
 * Persist an analyst's alert-threshold edit (§7.9). Backend route not confirmed
 * (Backend Gaps, P1) — the caller treats a rejection as a soft failure.
 * @param {{ id?: string, crimeType: string, value: number, unit?: string }} p
 * @returns {Promise<{ ok: boolean }>}
 */
export async function saveThreshold({ id, crimeType, value, unit } = {}) {
  const { data } = await apiClient.post(ENDPOINTS.auditThreshold, {
    id,
    crime_type: crimeType,
    value,
    unit,
  })
  return data
}
