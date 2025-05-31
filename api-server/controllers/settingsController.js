import {
  getSettings as dbGetSettings,
  updateSettings as dbUpdateSettings,
  getTenantFlags,
  setTenantFlags
} from '../../../../db/index.js';
import { requireAuth } from '../middlewares/auth.js';

// Global application settings
export async function getSettings(req, res, next) {
  try {
    const settings = await dbGetSettings();
    res.json(settings);
  } catch (err) {
    next(err);
  }
}

export async function updateSettings(req, res, next) {
  try {
    const updated = await dbUpdateSettings(req.body);
    res.json(updated);
  } catch (err) {
    next(err);
  }
}

// Tenant-specific feature flags
export async function getTenantFlagsHandler(req, res, next) {
  try {
    const companyId = req.user.company_id || req.query.companyId;
    const flags = await getTenantFlags(companyId);
    res.json(flags);
  } catch (err) {
    next(err);
  }
}

export async function setTenantFlagsHandler(req, res, next) {
  try {
    const companyId = req.user.company_id || req.body.companyId;
    const updatedFlags = await setTenantFlags(companyId, req.body.flags);
    res.json(updatedFlags);
  } catch (err) {
    next(err);
  }
}
