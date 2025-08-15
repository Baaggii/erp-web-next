import {
  listActionGroups,
  getUserLevelActions,
  setUserLevelActions,
} from '../../db/index.js';

export async function listGroups(req, res, next) {
  try {
    const groups = await listActionGroups();
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
    const { modules, buttons, functions, api } = req.body;
    await setUserLevelActions(id, { modules, buttons, functions, api });
    res.sendStatus(200);
  } catch (err) {
    next(err);
  }
}
