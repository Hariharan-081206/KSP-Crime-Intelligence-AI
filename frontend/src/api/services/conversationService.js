import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Fetch a full conversation thread by session id (for export context / audit).
 * @param {string} sessionId
 * @returns {Promise<{ session_id: string, turns: Array<{ role: string, text: string, timestamp: number|string }> }>}
 * TODO: confirm shape against API Gateway.
 */
export async function getConversation(sessionId) {
  const { data } = await apiClient.get(ENDPOINTS.conversation(sessionId))
  return data
}
