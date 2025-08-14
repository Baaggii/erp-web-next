import {
  listRoleModulePermissions,
  setRoleModulePermission,
  getEmploymentSession,
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
    const session = await getEmploymentSession(req.user.empid, req.user.companyId);
    if (!session?.permissions?.developer) {
      return res.sendStatus(403);
    }
    const { companyId, roleId, moduleKey, allowed } = req.body;
    await setRoleModulePermission(companyId, roleId, moduleKey, allowed);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
