import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * @typedef {Object} BehavioralProfile
 * @property {string} accusedId
 * @property {string} name
 * @property {Array<{ label: string, value: string }>} rows
 * TODO: confirm shape against API Gateway.
 */

/**
 * Fetch a suspect behavioral profile.
 * @param {{ accusedId?: string }} [p]
 * @returns {Promise<BehavioralProfile>}
 */
export async function getBehavioralProfile({ accusedId } = {}) {
  // GET when scoped by id, POST when the backend expects a richer query body.
  if (accusedId) {
    const { data } = await apiClient.get(ENDPOINTS.profileBehavioral, {
      params: { accused_id: accusedId },
    })
    return data
  }
  const { data } = await apiClient.get(ENDPOINTS.profileBehavioral)
  return data
}
