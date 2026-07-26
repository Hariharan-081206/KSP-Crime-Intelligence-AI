// File: backend/middleware/authMiddleware.js

import { errorResponse } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import { HTTP_STATUS, normalizeRoleName } from '../utils/constants.js';

/**
 * authMiddleware
 * ---------------------------------------------------------------------------
 * Verifies the incoming request carries a valid, active Catalyst user
 * session and attaches a normalized user object to req.user.
 */
const authMiddleware = async (req, res, next) => {
  try {
    const catalystApp = req.catalystApp;

    if (!catalystApp) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.INTERNAL_ERROR,
        message: 'Catalyst SDK not initialized on this request.'
      });
    }

    const userManagement = catalystApp.userManagement();
    const currentUser = await userManagement.getCurrentUser();

    if (!currentUser || !currentUser.user_id) {
      return errorResponse(res, {
        statusCode: HTTP_STATUS.UNAUTHORIZED,
        message: 'Unauthorized: No active user session found.'
      });
    }

    // `user_id` and `zuid` are DIFFERENT identifiers on ICatalystUser — in the
    // console's user list they are visibly distinct columns (e.g. user_id
    // 5465…262016 vs zuid 50044353296). This previously set zuid to user_id,
    // which was self-consistent (audit rows were written and compared with the
    // same value) but stored the wrong id in CONVERSATION_LOG.ZUID.
    req.user = {
      userId: currentUser.user_id,
      zuid: currentUser.zuid ?? currentUser.user_id,
      email: currentUser.email_id,
      firstName: currentUser.first_name,
      lastName: currentUser.last_name,
      orgId: currentUser.org_id,
      // The role travels with the session — it is configured in the Catalyst
      // console (Authentication → Manage Application Users → Roles), so no
      // Data Store lookup is needed. Null here means "signed in, but the role
      // is not one of the three SCRB roles"; roleMiddleware renders that as 403.
      role: normalizeRoleName(currentUser.role_details?.role_name),
      rawRole: currentUser.role_details?.role_name ?? null,
      raw: currentUser
    };

    next();
  } catch (err) {
    logger.error('authMiddleware', 'Authentication failed', err);
    return errorResponse(res, {
      statusCode: HTTP_STATUS.UNAUTHORIZED,
      message: 'Unauthorized: Invalid or expired session.',
      error: err
    });
  }
};

export default authMiddleware;