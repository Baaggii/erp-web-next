import express from 'express';
import fs from 'fs/promises';
import path from 'path';
import { requireAuth } from '../middlewares/auth.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';
import { getConfigPath, tenantConfigPath } from '../utils/configPaths.js';

const router = express.Router();

function normalizeBulkUpdateConfig(input) {
  if (!input || typeof input !== 'object') return null;
  const fieldName = String(input.fieldName || '').trim();
  const hasDefaultValue =
    Object.prototype.hasOwnProperty.call(input, 'defaultValue');
  const defaultValue = hasDefaultValue
    ? input.defaultValue === undefined || input.defaultValue === null
      ? ''
      : String(input.defaultValue)
    : '';
  if (!fieldName && !defaultValue) return null;
  return { fieldName, defaultValue };
}

router.patch('/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    const companyId = Number(req.user.companyId);
    if (!Number.isFinite(companyId)) {
      return res.status(400).json({ message: 'companyId required' });
    }
    const { branchId, departmentId } = req.query;
    const { procedures } = await listPermittedProcedures(
      { branchId, departmentId },
      companyId,
      req.user,
    );
    const allowed = procedures.some((proc) => proc.name === name);
    if (!allowed) {
      return res.status(403).json({ message: 'Procedure not allowed' });
    }
    const rawConfig =
      req.body?.bulkUpdateConfig ||
      req.body?.bulk_update_config || {
        fieldName: req.body?.fieldName ?? req.body?.field_name,
        defaultValue: req.body?.defaultValue ?? req.body?.default_value,
      };
    const bulkUpdateConfig = normalizeBulkUpdateConfig(rawConfig);

    let baseConfig = { procName: name };
    try {
      const { path: configPath } = await getConfigPath(
        path.join('report_builder', `${name}.json`),
        companyId,
      );
      const existing = await fs.readFile(configPath, 'utf-8');
      baseConfig = JSON.parse(existing);
    } catch {
      baseConfig = { procName: name };
    }

    if (bulkUpdateConfig) {
      baseConfig.bulkUpdateConfig = bulkUpdateConfig;
    } else {
      delete baseConfig.bulkUpdateConfig;
    }

    const destPath = tenantConfigPath(
      path.join('report_builder', `${name}.json`),
      companyId,
    );
    await fs.mkdir(path.dirname(destPath), { recursive: true });
    await fs.writeFile(destPath, JSON.stringify(baseConfig, null, 2));
    res.json({ ok: true, bulkUpdateConfig });
  } catch (err) {
    next(err);
  }
});

export default router;
