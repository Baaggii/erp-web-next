import {
  getUserLevelActions,
  setUserLevelActions,
  listUserLevels,
  populateMissingPermissions,
  listModules,
} from '../../db/index.js';
import fs from 'fs/promises';
import { resolveConfigPathSync } from '../utils/configPaths.js';

export async function listGroups(req, res, next) {
  try {
    const actionsPath = resolveConfigPathSync(
      'permissionActions.json',
      req.user.companyId,
    );
    const raw = await fs.readFile(actionsPath, 'utf8');
    const registry = JSON.parse(raw);
    const allForms = registry.forms || {};
    const forms = Object.fromEntries(
      Object.entries(allForms).filter(([, f]) => f.scope !== 'system'),
    );
    const permissions = registry.permissions || [];
    const rawModules = await listModules(
      req.user.userLevel,
      req.user.companyId,
    );
    const nodes = new Map();
    for (const m of rawModules) {
      if (m.show_in_sidebar || m.show_in_header) {
        nodes.set(m.module_key, {
          key: m.module_key,
          name: m.label,
          parent: m.parent_key,
          children: [],
        });
      }
    }
    const roots = [];
    for (const node of nodes.values()) {
      if (node.parent && nodes.has(node.parent)) {
        nodes.get(node.parent).children.push(node);
      } else {
        roots.push(node);
      }
    }
    // Remove the temporary parent references before sending
    const strip = (n) => ({
      key: n.key,
      name: n.name,
      children: n.children.map(strip),
    });
    res.json({ modules: roots.map(strip), forms, permissions });
  } catch (err) {
    next(err);
  }
}

export async function getActions(req, res, next) {
  try {
    const id = req.params.userLevelId;
    const actions = await getUserLevelActions(id, req.user.companyId);
    res.json(actions);
  } catch (err) {
    next(err);
  }
}

export async function updateActions(req, res, next) {
  try {
    const id = req.params.userLevelId;
    const { modules, buttons, functions, api, permissions } = req.body;
    await setUserLevelActions(id, {
      modules,
      buttons,
      functions,
      api,
      permissions,
    }, req.user.companyId);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}

export async function listUserLevelsController(req, res, next) {
  try {
    const rows = await listUserLevels();
    res.json(rows);
  } catch (err) {
    next(err);
  }
}

export async function populateMissing(req, res, next) {
  try {
    const allow = !!req.body?.allow;
    const permissions = req.body?.permissions || [];
    await populateMissingPermissions(
      allow,
      permissions,
      req.user.companyId,
    );
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
