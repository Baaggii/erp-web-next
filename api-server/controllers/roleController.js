import { listUserRoles } from '../../db/index.js';

export async function listRoles(req, res, next) {
  try {
    const roles = await listUserRoles();
    res.json(roles);
  } catch (err) {
    next(err);
  }
}
