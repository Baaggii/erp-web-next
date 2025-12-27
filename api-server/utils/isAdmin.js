import { ADMIN_EMPLOYMENT_LEVEL } from '../../config/0/constants.js';

export function isAdmin(user) {
  if (!user || typeof user !== 'object') return false;
  if (user.isAdmin === true) return true;
  const level =
    user.employment_user_level ??
    user.userLevel ??
    user.employmentUserLevel ??
    null;
  if (level !== null && Number(level) === ADMIN_EMPLOYMENT_LEVEL) return true;
  return false;
}
