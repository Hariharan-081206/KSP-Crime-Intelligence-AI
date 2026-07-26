import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * Request a server-generated, per-role PDF export. The backend's SmartBrowz
 * template branches on `role` (policymaker=summary, investigator=case packet,
 * analyst=analytical — spec §7.12); `scope` + `filters` narrow the data set
 * (e.g. scope='district', filters={ districtId }).
 * @param {{ role?: string, scope?: string, sessionId?: string, filters?: object, title?: string }} p
 * @returns {Promise<Blob>} PDF blob. TODO: confirm shape/content-type.
 */
export async function exportPdf({ role, scope, sessionId, filters, title } = {}) {
  const { data } = await apiClient.post(
    ENDPOINTS.exportPdf,
    { role, scope, session_id: sessionId, filters, title },
    { responseType: 'blob' },
  )
  return data
}
