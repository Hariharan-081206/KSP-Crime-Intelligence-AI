import apiClient from '../apiClient'
import { ENDPOINTS } from '../endpoints'

/**
 * @typedef {Object} NetworkNode
 * @property {string} id
 * @property {'accused'|'location'} type
 * @property {string} name
 * @property {number} centrality
 * @property {string} [description]
 *
 * @typedef {Object} NetworkEdge
 * @property {string} source
 * @property {string} target
 * @property {number} weight
 * @property {'associate'|'visited'} [type]
 *
 * @typedef {Object} NetworkGraphData
 * @property {NetworkNode[]} nodes
 * @property {NetworkEdge[]} edges
 * TODO: confirm shape against API Gateway. (Financial/money-trail edges removed.)
 */

/**
 * Fetch the co-occurrence / co-accused network.
 * @param {Object} [params] optional filters (e.g. { caseId, accusedId }).
 * @returns {Promise<NetworkGraphData>}
 */
export async function getNetwork(params = {}) {
  const { data } = await apiClient.get(ENDPOINTS.graphNetwork, { params })
  return data
}
