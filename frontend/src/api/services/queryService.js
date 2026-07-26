import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * @typedef {Object} QueryResponse
 * @property {string} session_id
 * @property {string} [text]              Assistant natural-language answer.
 * @property {Object} [classification]    { intent, confidence, model_version }
 * @property {Object} [routing_decision]  { target_module, routed }
 * @property {Object} [panel]             { type: 'map'|'network', data }
 * @property {Array}  [reasoning]         [{ stage, label }] reasoning trace.
 * @property {string} [caseId]            Matched case id, if any.
 * TODO: confirm exact shape against API Gateway — do not assume legacy mock keys.
 */

/**
 * Send a natural-language query to the orchestrator.
 * @param {{ sessionId: string, query: string, language?: string, role?: string }} p
 * @returns {Promise<QueryResponse>}
 */
export async function postQuery({ sessionId, query, language = 'en', role } = {}) {
  const { data } = await apiClient.post(ENDPOINTS.query, {
    session_id: sessionId,
    query,
    language,
    role,
  })
  return data
}
