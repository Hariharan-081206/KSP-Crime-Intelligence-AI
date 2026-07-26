// File: backend/services/authService.js

// Roles live in the Catalyst console (Authentication → Manage Application Users
// → Roles) and ride along on every session as role_details.role_name. The old
// `UserRoles` Data Store table is gone: two sources of truth for authorization
// is exactly the kind of thing that drifts silently and fails open.

import { ALL_ROLES, HTTP_STATUS, normalizeRoleName } from '../utils/constants.js';
import logger from '../utils/logger.js';

export const getCurrentUserProfile = async (catalystApp) => {
  try {
    const userManagement = catalystApp.userManagement();
    const currentUser = await userManagement.getCurrentUser();
    if (!currentUser) return null;

    return {
      // Spec §8 names this `user_id`, and the frontend's authService.resolveRole
      // reads `{ user_id, role }`. `zuid` is a genuinely different identifier on
      // ICatalystUser, not an alias — both are surfaced.
      user_id: currentUser.user_id,
      zuid: currentUser.zuid ?? currentUser.user_id,
      email: currentUser.email_id,
      firstName: currentUser.first_name,
      lastName: currentUser.last_name,
      role: normalizeRoleName(currentUser.role_details?.role_name),
      // The console's raw label, so a role that fails to map is debuggable from
      // the response instead of only from the logs.
      catalystRole: currentUser.role_details?.role_name ?? null
    };
  } catch (err) {
    logger.error('authService.getCurrentUserProfile', 'Failed', err);
    throw err;
  }
};

/**
 * Role assignment is a Catalyst console / user-management operation now, not a
 * Data Store write. Deliberately not implemented rather than silently writing to
 * a table nothing reads — that would report success and change no permission.
 *
 * Implementing it needs `userManagement.updateUserDetails(id, { role_id })`,
 * which takes a role *id*, so it also needs a name→id map for the project's
 * roles. No frontend surface calls this route.
 */
export const assignUserRole = async () => {
  const err = new Error(
    'Role assignment is managed in the Catalyst console: Authentication → ' +
      `Manage Application Users → Roles. Valid SCRB roles: ${ALL_ROLES.join(', ')}.`
  );
  err.statusCode = HTTP_STATUS.NOT_IMPLEMENTED;
  throw err;
};

/**
 * Only meaningful for the caller of the current request, since the role comes
 * from that request's session rather than from a queryable table.
 */
export const getRoleForUser = async (catalystApp) => {
  const profile = await getCurrentUserProfile(catalystApp);
  return profile?.role ?? null;
};

export default { getCurrentUserProfile, assignUserRole, getRoleForUser };