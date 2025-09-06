import { getUserSettings, saveUserSettings } from '../services/userSettings.js';

export async function getUserSettingsHandler(req, res, next) {
  try {
    const settings = await getUserSettings(req.user.empid, req.user.companyId);
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function updateUserSettingsHandler(req, res, next) {
  try {
    const updated = await saveUserSettings(req.user.empid, req.body, req.user.companyId);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}
