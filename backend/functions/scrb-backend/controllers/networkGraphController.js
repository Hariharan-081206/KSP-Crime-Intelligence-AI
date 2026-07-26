/**
 * networkGraphController.js
 * ----------------------------------------------------------------------------
 * HTTP layer for the Criminal Network Graph module.
 *
 * Rules followed (per project convention):
 *   - Controllers ONLY call services. No business logic, no raw ZCQL here.
 *   - All responses go through formatter.js.
 *   - All status codes come from constants.js HTTP_STATUS.
 *   - All logging goes through logger.js.
 * ----------------------------------------------------------------------------
 */

import networkGraphService from '../services/networkGraphService.js';
import logger from '../utils/logger.js';
import formatter from '../utils/formatter.js';
import { HTTP_STATUS } from '../utils/constants.js';

/**
 * GET /graph/case/:id
 * Returns the full relationship graph rooted at a CaseMaster record.
 */
async function getCaseGraph(req, res) {
  const { id } = req.params;
  try {
    logger.info(`[networkGraphController] getCaseGraph called for case ${id}`);
    const graph = await networkGraphService.buildCaseGraph(id);

    if (!graph.nodes.length) {
      return formatter.error(res, `No graph could be built for case ${id}. Record not found.`, HTTP_STATUS.NOT_FOUND);
    }

    return formatter.success(res, graph, 'Case graph generated successfully', HTTP_STATUS.OK);
  } catch (err) {
    logger.error(`[networkGraphController] getCaseGraph failed for case ${id}: ${err.message}`);
    return formatter.error(res, 'Failed to generate case graph', HTTP_STATUS.INTERNAL_SERVER_ERROR, err);
  }
}

/**
 * GET /graph/accused/:id
 * Returns the full relationship graph rooted at an Accused record.
 */
async function getAccusedGraph(req, res) {
  const { id } = req.params;
  try {
    logger.info(`[networkGraphController] getAccusedGraph called for accused ${id}`);
    const graph = await networkGraphService.buildAccusedGraph(id);

    if (!graph.nodes.length) {
      return formatter.error(res, `No graph could be built for accused ${id}. Record not found.`, HTTP_STATUS.NOT_FOUND);
    }

    return formatter.success(res, graph, 'Accused graph generated successfully', HTTP_STATUS.OK);
  } catch (err) {
    logger.error(`[networkGraphController] getAccusedGraph failed for accused ${id}: ${err.message}`);
    return formatter.error(res, 'Failed to generate accused graph', HTTP_STATUS.INTERNAL_SERVER_ERROR, err);
  }
}

/**
 * GET /graph/transaction/:id
 * Returns a focused graph around a FinancialTransaction record.
 */
async function getTransactionGraph(req, res) {
  const { id } = req.params;
  try {
    logger.info(`[networkGraphController] getTransactionGraph called for transaction ${id}`);
    const graph = await networkGraphService.buildTransactionGraph(id);

    if (!graph.nodes.length) {
      return formatter.error(res, `No graph could be built for transaction ${id}. Record not found.`, HTTP_STATUS.NOT_FOUND);
    }

    return formatter.success(res, graph, 'Transaction graph generated successfully', HTTP_STATUS.OK);
  } catch (err) {
    logger.error(`[networkGraphController] getTransactionGraph failed for transaction ${id}: ${err.message}`);
    return formatter.error(res, 'Failed to generate transaction graph', HTTP_STATUS.INTERNAL_SERVER_ERROR, err);
  }
}

/**
 * GET /graph/network?caseId=&accusedId=   (spec §8 — the frontend's call)
 * GET /graph/network/:caseId              (path-param form)
 *
 * Returns the COMPLETE recursively-expanded criminal network. `caseId` and
 * `accusedId` are OPTIONAL filters: with neither, the global network is built
 * (capped by GLOBAL_NETWORK_SEED_CASES in networkGraphService).
 */
async function getFullNetworkGraph(req, res) {
  // Path param wins, then query param — the SPA sends filters as query params.
  const caseId = req.params?.caseId ?? req.query?.caseId;
  const accusedId = req.query?.accusedId;
  const scope = caseId ? `case ${caseId}` : accusedId ? `accused ${accusedId}` : 'global';

  try {
    logger.info(`[networkGraphController] getFullNetworkGraph called (scope=${scope})`);

    let graph;
    if (caseId) {
      graph = await networkGraphService.buildNetworkGraph(caseId);
    } else if (accusedId) {
      graph = await networkGraphService.buildAccusedGraph(accusedId);
    } else {
      graph = await networkGraphService.buildGlobalNetworkGraph(req.catalystApp);
    }

    if (!graph.nodes.length) {
      return formatter.error(res, `No network could be built for ${scope}. Record not found.`, HTTP_STATUS.NOT_FOUND);
    }

    if (graph.meta?.truncated) {
      logger.warn(`[networkGraphController] Network graph for ${scope} was truncated at safety limits`);
    }

    return formatter.success(res, graph, 'Full criminal network generated successfully', HTTP_STATUS.OK);
  } catch (err) {
    logger.error(`[networkGraphController] getFullNetworkGraph failed for ${scope}: ${err.message}`);
    return formatter.error(res, 'Failed to generate full network graph', HTTP_STATUS.INTERNAL_SERVER_ERROR, err);
  }
}

export default {
  getCaseGraph,
  getAccusedGraph,
  getTransactionGraph,
  getFullNetworkGraph,
};
