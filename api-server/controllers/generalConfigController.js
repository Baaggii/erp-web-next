import * as cfgSvc from '../services/generalConfig.js';
import { getEmploymentSession } from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

export async function fetchGeneralConfig(req, res, next) {
  try {
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (session?.company_id === 0) return res.sendStatus(403);
    if (!(await hasAction(session, 'system_settings'))) return res.sendStatus(403);
    const getter = req.getGeneralConfig || cfgSvc.getGeneralConfig;
    const cfg = await getter();
    res.json(cfg);
  } catch (err) {
    next(err);
  }
}

export async function saveGeneralConfig(req, res, next) {
  try {
    const session =
      req.session ||
      (await getEmploymentSession(req.user.empid, req.user.companyId));
    if (session?.company_id === 0) return res.sendStatus(403);
    if (!(await hasAction(session, 'system_settings'))) return res.sendStatus(403);
    const updater = req.updateGeneralConfig || cfgSvc.updateGeneralConfig;
    const cfg = await updater(req.body || {});
    res.json(cfg);
  } catch (err) {
    next(err);
  }
}
