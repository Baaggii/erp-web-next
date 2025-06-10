import { listUserRoles as dbListUserRoles } from '../../db/index.js';

export async function listUserRoles(req, res, next) {
  try {
    const roles = await dbListUserRoles();
    res.json(roles);
  } catch (err) {
    next(err);
  }
}
