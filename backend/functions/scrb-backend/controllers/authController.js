// File: backend/controllers/authController.js

import * as authService from '../services/authService.js';
import { successResponse, errorResponse } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import { HTTP_STATUS } from '../utils/constants.js';

export const getCurrentUser = async (req, res) => {
  try {
    const profile = await authService.getCurrentUserProfile(req.catalystApp);

    if (!profile) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.NOT_FOUND,
        message: 'No profile found for the authenticated user.'
      });
    }

    return successResponse(res, { data: profile });
  } catch (err) {
    logger.error('authController.getCurrentUser', 'Failed', err);
    return errorResponse(res, { message: 'Failed to retrieve user profile.', error: err });
  }
};

/**
 * ASSUMPTION: role assignment restricted to Policymaker via roleMiddleware
 * at the route level — confirm the actual admin persona per Section 8.
 */
export const assignRole = async (req, res) => {
  const { zuid, email, roleName, department } = req.body;

  try {
    const result = await authService.assignUserRole(req.catalystApp, { zuid, email, roleName, department });
    return successResponse(res, {
      statusCode: HTTP_STATUS.CREATED,
      message: `Role "${roleName}" assigned successfully.`,
      data: result
    });
  } catch (err) {
    logger.error('authController.assignRole', 'Failed', err);
    return errorResponse(res, {
      statusCode: err.statusCode || HTTP_STATUS.INTERNAL_ERROR,
      message: err.message || 'Failed to assign role.'
    });
  }
};

export default { getCurrentUser, assignRole };