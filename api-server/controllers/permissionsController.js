import { getUserLevelActions, setUserLevelActions } from '../../db/index.js';
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
    const groups = JSON.parse(raw);
    res.json(groups);
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
