import {
  listModules as dbListModules,
  upsertModule,
  populateDefaultModules,
  populateCompanyModuleLicenses,
  populateUserLevelModulePermissions,
  getEmploymentSession,
} from "../../db/index.js";
import { logActivity } from "../utils/activityLog.js";
import { hasAction } from "../utils/hasAction.js";

export async function listModules(req, res, next) {
  try {
    const modules = await dbListModules();
    res.json(modules);
  } catch (err) {
    next(err);
  }
}

export async function saveModule(req, res, next) {
  try {
    const moduleKey = req.params.moduleKey || req.body.moduleKey;
    const origin = req.get('x-origin');
    // Guard against unintended updates from the forms configuration page
    if (origin === 'form-management') {
      logActivity(
        `saveModule blocked: ${req.user.email || req.user.id} -> ${moduleKey} origin=${origin}`,
      );
      return res
        .status(403)
        .json({ message: 'Forbidden: Cannot update module from forms config' });
    }
    logActivity(
      `saveModule attempt: ${req.user.email || req.user.id} -> ${moduleKey} origin=${origin}`,
    );
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, "system_settings"))) return res.sendStatus(403);
    const label = req.body.label;
    const parentKey = req.body.parentKey || null;
    const showInSidebar = req.body.showInSidebar ?? true;
    const showInHeader = req.body.showInHeader ?? false;
    if (!moduleKey || !label)
      return res.status(400).json({ message: 'Missing fields' });
    const result = await upsertModule(
      moduleKey,
      label,
      parentKey,
      showInSidebar,
      showInHeader,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function populatePermissions(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, "system_settings"))) return res.sendStatus(403);
    await populateDefaultModules();
    await populateCompanyModuleLicenses();
    await populateUserLevelModulePermissions();
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
