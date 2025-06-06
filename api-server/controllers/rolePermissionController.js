import {
  listRoleModulePermissions,
  setRoleModulePermission
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
    const { roleId, moduleKey, allowed } = req.body;
    await setRoleModulePermission(roleId, moduleKey, allowed);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
