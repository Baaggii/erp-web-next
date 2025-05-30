import { getTenantFlags, setTenantFlags } from '../../db/index.js';
export async function getSettings(req, res, next) {
  try {
    const flags = await getTenantFlags(req.user.companies[0]);
    res.json(flags);
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const updated = await setTenantFlags(req.user.companies[0], req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}