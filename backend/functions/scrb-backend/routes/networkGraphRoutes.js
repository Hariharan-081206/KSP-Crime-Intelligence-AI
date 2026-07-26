/**
 * networkGraphRoutes.js
 * ----------------------------------------------------------------------------
 * Express router for the Criminal Network Graph module.
 * Mounted at /graph in functions/query/index.js.
 * ----------------------------------------------------------------------------
 */

import express from 'express';
import networkGraphController from '../controllers/networkGraphController.js';
import validateRequest from '../middlewares/validateRequest.js';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import { ROLES } from '../utils/constants.js';

const router = express.Router();

// RBAC (spec §5): the criminal network graph (incl. co-accused PII) is an
// investigator-only surface. Enforced server-side so a direct call from a
// policymaker/analyst session is rejected, not merely hidden in the UI.
router.use(authMiddleware, roleMiddleware([ROLES.INVESTIGATOR]));

/**
 * Simple param schema requiring a non-empty :id / :caseId path param.
 * Adjust to match your actual validateRequest / schema convention if
 * validateRequest expects a Joi/Yup/Zod schema object instead of this shape.
 */
const idParamSchema = {
  params: {
    id: { type: 'string', required: true },
  },
};

const caseIdParamSchema = {
  params: {
    caseId: { type: 'string', required: true },
  },
};

/**
 * Spec §8: the frontend calls GET /graph/network with NO path param and passes
 * optional filters as query params (`{ caseId, accusedId }` — see
 * frontend/src/api/services/networkService.js). Unfiltered means "the global
 * co-accused network", capped server-side.
 */
const networkQuerySchema = {
  query: {
    caseId: { type: 'string', required: false },
    accusedId: { type: 'string', required: false },
    limit: { type: 'string', required: false },
  },
};

// GET /graph/case/:id
router.get('/case/:id', validateRequest(idParamSchema), networkGraphController.getCaseGraph);

// GET /graph/accused/:id
router.get('/accused/:id', validateRequest(idParamSchema), networkGraphController.getAccusedGraph);

// GET /graph/transaction/:id
router.get('/transaction/:id', validateRequest(idParamSchema), networkGraphController.getTransactionGraph);

// GET /graph/network?caseId=&accusedId=  — spec §8, the path the SPA calls.
// Declared before the `:caseId` variant; Express matches the static path first.
router.get('/network', validateRequest(networkQuerySchema), networkGraphController.getFullNetworkGraph);

// GET /graph/network/:caseId — equivalent path-param form, retained.
router.get('/network/:caseId', validateRequest(caseIdParamSchema), networkGraphController.getFullNetworkGraph);

export default router;
