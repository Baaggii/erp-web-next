import {
  listRoleModulePermissions,
  setRoleModulePermission,
  getEmploymentSession,
  getUserLevelActions,
} from '../../db/index.js';

export async function listPermissions(req, res, next) {
  try {
    const roleId = req.query.roleId;
    const companyId = req.query.companyId;
    const perms = await listRoleModulePermissions(roleId, companyId);
    res.json(perms);
  } catch (err) {
    next(err);
  }
}

export async function updatePermission(req, res, next) {
  try {
    if (req.user.role !== 'admin') {
      return res.sendStatus(403);
    }
    const { companyId, roleId, moduleKey, allowed } = req.body;
    await setRoleModulePermission(companyId, roleId, moduleKey, allowed);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function getUserActions(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    const permissions = session?.user_level
      ? await getUserLevelActions(session.user_level)
      : {};
    res.json(permissions);
  } catch (err) {
    next(err);
  }
}
