// File: backend/routes/authRoutes.js

import { Router } from 'express';
import authMiddleware from '../middlewares/authMiddleware.js';
import roleMiddleware from '../middlewares/roleMiddleware.js';
import validateRequest from '../middlewares/validateRequest.js';
import * as authController from '../controllers/authController.js';
import { ROLES } from '../utils/constants.js';

const router = Router();

// GET /auth/role — spec §8. The frontend resolves the signed-in user's role
// here (`ENDPOINTS.authRole`). Renamed from `/me`; the response shape
// ({ user_id, role }) is reconciled in Step 5.
router.get('/role', authMiddleware, authController.getCurrentUser);

router.post(
  '/assign-role',
  authMiddleware,
  roleMiddleware([ROLES.POLICYMAKER]),
  validateRequest({
    body: {
      zuid: { required: true, type: 'string' },
      email: { required: true, type: 'string' },
      roleName: { required: true, type: 'string', enum: Object.values(ROLES) },
      department: { required: false, type: 'string' }
    }
  }),
  authController.assignRole
);

export default router;