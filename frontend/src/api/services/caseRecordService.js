import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Fetch the raw DB record (all linked relations) for a FIR/case — powers the
 * §5 Case Record drawer.
 *
 * @typedef {Object} CaseRecord
 * @property {Object}   case_master
 * @property {Array}    accused
 * @property {Array}    victim
 * @property {Array}    arrest_surrender
 * @property {Array}    chargesheet_details
 * @property {Object}   complainant
 * @property {Array}    acts_sections
 *
 * NOTE: GET /api/case/:caseId/record does NOT exist in scrb-backend yet
 * (Backend Gaps, P0). When it 404s / errors and VITE_DEMO_MODE === 'true',
 * we fall back to a gated demo fixture so the drawer is presentable; otherwise
 * the error propagates and the drawer shows its error state.
 *
 * @param {string} caseId
 * @returns {Promise<CaseRecord>}
 */
export async function getCaseRecord(caseId) {
  try {
    const { data } = await apiClient.get(ENDPOINTS.caseRecord(caseId))
    return data
  } catch (err) {
    if (import.meta.env.VITE_DEMO_MODE === 'true') {
      const { buildCaseRecordFixture } = await import('../../data/caseRecordFixture')
      return buildCaseRecordFixture(caseId)
    }
    throw err
  }
}
