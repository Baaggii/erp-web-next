import {
  listRoleModulePermissions,
  setRoleModulePermission,
  getEmploymentSession,
  getUserLevelActions,
} from '../../db/index.js';

export async function listPermissions(req, res, next) {
  try {
    const positionId = req.query.positionId;
    const companyId = req.query.companyId;
    const perms = await listRoleModulePermissions(positionId, companyId);
    res.json(perms);
  } catch (err) {
    next(err);
  }
}

export async function updatePermission(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!session?.permissions?.system_settings) {
      return res.sendStatus(403);
    }
    const { companyId, positionId, moduleKey, allowed } = req.body;
    await setRoleModulePermission(companyId, positionId, moduleKey, allowed);
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
