// File: backend/routes/reportRoutes.js

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import validateRequest from '../middlewares/validateRequest.js';
import * as reportController from '../controllers/reportController.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

router.get(
  '/summary',
  authMiddleware,
  roleMiddleware([ROLES.POLICYMAKER]),
  validateRequest({
    query: {
      zone: { required: true, type: 'string' },
      dateFrom: { required: false, type: 'string' },
      dateTo: { required: false, type: 'string' }
    }
  }),
  reportController.generateSummaryReport
);

router.get(
  '/:threadId',
  authMiddleware,
  roleMiddleware([ROLES.POLICYMAKER]),
  reportController.getReportData
);

export default router;