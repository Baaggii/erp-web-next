import {
  listModules as dbListModules,
  upsertModule,
  populateRoleModulePermissions,
} from "../../db/index.js";

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
    if (req.user.role !== 'admin') return res.sendStatus(403);
    const moduleKey = req.params.moduleKey || req.body.moduleKey;
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
    if (req.user.role !== 'admin') return res.sendStatus(403);
    await populateRoleModulePermissions();
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
