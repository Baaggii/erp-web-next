import {
  getUserLevelActions,
  setUserLevelActions,
  listUserLevels,
  populateMissingPermissions,
  listModules,
} from '../../db/index.js';
import fs from 'fs/promises';
import { existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Resolve the permission registry path so it works regardless of the
// directory the server is launched from or how the code is bundled.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const actionsPath = (() => {
  const cwdPath = path.resolve(process.cwd(), 'configs/permissionActions.json');
  if (existsSync(cwdPath)) return cwdPath;
  return path.resolve(__dirname, '../../configs/permissionActions.json');
})();

export async function listGroups(req, res, next) {
  try {
    const raw = await fs.readFile(actionsPath, 'utf8');
    const registry = JSON.parse(raw);
    const allForms = registry.forms || {};
    const forms = Object.fromEntries(
      Object.entries(allForms).filter(([, f]) => f.scope !== 'system'),
    );
    const rawModules = await listModules();
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
    res.json({ modules: roots.map(strip), forms });
  } catch (err) {
    next(err);
  }
}

export async function getActions(req, res, next) {
  try {
    const id = req.params.userLevelId;
    const actions = await getUserLevelActions(id);
    res.json(actions);
  } catch (err) {
    next(err);
  }
}

export async function updateActions(req, res, next) {
  try {
    const id = req.params.userLevelId;
    if (Number(id) === 1) {
      return res
        .status(400)
        .json({ message: 'System admin permissions cannot be modified' });
    }
    const { modules, buttons, functions, api } = req.body;
    await setUserLevelActions(id, { modules, buttons, functions, api });
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
    await populateMissingPermissions(allow);
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
