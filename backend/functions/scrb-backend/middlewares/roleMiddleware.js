// File: backend/middleware/roleMiddleware.js

import { errorResponse } from '../utils/formatter.js';
import logger from '../utils/logger.js';
import { ALL_ROLES, HTTP_STATUS } from '../utils/constants.js';

/**
 * Factory: returns middleware allowing only the given roles.
 * @param {string[]} allowedRoles
 */
const roleMiddleware = (allowedRoles = []) => {
  const invalidRoles = allowedRoles.filter((r) => !ALL_ROLES.includes(r));
  if (invalidRoles.length > 0) {
    throw new Error(`[roleMiddleware] Unknown role(s) configured: ${invalidRoles.join(', ')}`);
  }

  return async (req, res, next) => {
    try {
      if (!req.user) {
        return errorResponse(res, {
          statusCode: HTTP_STATUS.UNAUTHORIZED,
          message: 'Unauthorized: authMiddleware must run before roleMiddleware.'
        });
      }

      // Set by authMiddleware from the session's role_details.role_name. No
      // Data Store round-trip: the Catalyst console is the source of truth.
      const role = req.user.role;

      if (!role) {
        return errorResponse(res, {
          statusCode: HTTP_STATUS.FORBIDDEN,
          message: req.user.rawRole
            ? `Forbidden: Catalyst role '${req.user.rawRole}' is not an SCRB role. ` +
              `Assign one of ${ALL_ROLES.join(', ')} in the Catalyst console ` +
              '(Authentication → Manage Application Users → Roles).'
            : 'Forbidden: No role is assigned to this account in the Catalyst console. ' +
              'Contact your administrator.'
        });
      }

      if (!allowedRoles.includes(role)) {
        return errorResponse(res, {
          statusCode: HTTP_STATUS.FORBIDDEN,
          message: `Forbidden: Role '${role}' is not permitted to access this resource.`
        });
      }

      next();
    } catch (err) {
      logger.error('roleMiddleware', 'Role resolution failed', err);
      return errorResponse(res, {
        statusCode: HTTP_STATUS.INTERNAL_ERROR,
        message: 'Failed to verify user role.',
        error: err
      });
    }
  };
};

export default roleMiddleware;