import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Run a crime forecast. Hits /api/predict/forecast (NOT /api/pattern/discover,
 * which is an internal orchestrator route not for direct FE calls).
 * @param {{ district: string, crimeType: string, windowDays?: number }} p
 * @returns {Promise<{ district: string, crimeType: string, windowDays: number, predictedCount: number }>}
 * TODO: confirm shape against API Gateway.
 */
export async function runForecast({ district, crimeType, windowDays = 30 } = {}) {
  const { data } = await apiClient.post(ENDPOINTS.predictForecast, {
    district,
    crime_type: crimeType,
    window_days: windowDays,
  })
  return data
}

/**
 * Fetch SHAP-style contributing factors for a forecast.
 * @param {{ district: string, crimeType: string, windowDays?: number }} p
 * @returns {Promise<{ factors: Array<{ label: string, weight: number }> }>}
 * TODO: confirm shape against API Gateway.
 */
export async function explainForecast({ district, crimeType, windowDays = 30 } = {}) {
  const { data } = await apiClient.post(ENDPOINTS.predictExplain, {
    district,
    crime_type: crimeType,
    window_days: windowDays,
  })
  return data
}
