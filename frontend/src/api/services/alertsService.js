import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Fetch active early-warning alerts from the EarlyWarnings table.
 * @returns {Promise<Array<{ id: string, title: string, description: string, district: string, crimeType: string, severity: 'high'|'medium'|'low', detectedAt: number|string }>>}
 * TODO: confirm shape against API Gateway.
 */
export async function getActiveAlerts(params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.alertsActive, { params })
  return data
}
