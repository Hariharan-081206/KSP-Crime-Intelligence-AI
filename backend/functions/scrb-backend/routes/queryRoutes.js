// File: backend/routes/queryRoutes.js

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import validateRequest from '../middlewares/validateRequest.js';
import * as queryController from '../controllers/queryController.js';
import { ALL_ROLES } from '../utils/constants.js';

const router = Router();

router.post(
  '/',
  authMiddleware,
  roleMiddleware(ALL_ROLES),
  validateRequest({
    body: {
      // Frontend (authoritative, spec §8) sends `query`; `question` is kept as a
      // backward-compatible alias for internal callers (e.g. scratch tests).
      // Presence of one of them is enforced in the controller.
      query: { required: false, type: 'string', maxLength: 1000 },
      question: { required: false, type: 'string', maxLength: 1000 },
      sessionId: { required: false, type: 'string' }
    }
  }),
  queryController.handleQuery
);

router.get(
  '/:id',
  authMiddleware,
  roleMiddleware(ALL_ROLES),
  queryController.getQueryById
);

export default router;