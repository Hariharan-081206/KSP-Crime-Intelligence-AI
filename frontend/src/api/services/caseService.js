import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * @typedef {Object} CaseSummary
 * @property {string} caseId
 * @property {string} title
 * @property {string} status
 * @property {string} openedAt
 * @property {string} summary
 * @property {Array<{ date: string, label: string, detail: string }>} timeline
 * TODO: confirm shape against API Gateway.
 */

/** @returns {Promise<CaseSummary>} */
export async function getCaseSummary(caseId) {
  const { data } = await apiClient.get(ENDPOINTS.caseSummary(caseId))
  return data
}

/**
 * @returns {Promise<Array<{ id: string, title: string, similarity: number, severity: string }>>}
 * TODO: confirm shape.
 */
export async function getSimilarCases(caseId) {
  const { data } = await apiClient.get(ENDPOINTS.caseSimilar(caseId))
  return data
}

/**
 * Investigative lead suggestions grounded in network + behavioral context only
 * (financial-link grounding removed).
 * @returns {Promise<string[]>} TODO: confirm shape.
 */
export async function getCaseLeads(caseId) {
  const { data } = await apiClient.get(ENDPOINTS.caseLeads(caseId))
  return data
}
