import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middlewares/auth.js';

function tenantDir(companyId = 0) {
  return path.join(
    process.cwd(),
    'config',
    String(companyId),
    'report_builder',
  );
}

function normalizeBulkUpdateConfig(config) {
  if (!config || typeof config !== 'object') {
    return { fieldName: '', defaultValue: '', targetTable: '' };
  }
  const fieldName =
    typeof config.fieldName === 'string' ? config.fieldName.trim() : '';
  const targetTable =
    typeof config.targetTable === 'string' ? config.targetTable.trim() : '';
  const defaultValue =
    config.defaultValue === undefined || config.defaultValue === null
      ? ''
      : config.defaultValue;
  return { fieldName, defaultValue, targetTable };
}

const router = express.Router();

router.get('/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    if (!name) return res.status(400).json({ message: 'name required' });
    const dir = tenantDir(companyId);
    const text = await fs.readFile(path.join(dir, `${name}.json`), 'utf-8');
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err.code === 'ENOENT') {
      return res.status(404).json({ message: 'Config not found' });
    }
    next(err);
  }
});

router.patch('/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    if (!name) return res.status(400).json({ message: 'name required' });
    const dir = tenantDir(companyId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${name}.json`);
    let data = {};
    try {
      const text = await fs.readFile(file, 'utf-8');
      data = JSON.parse(text);
    } catch (err) {
      if (err.code !== 'ENOENT') throw err;
    }
    const bulkUpdateConfig = normalizeBulkUpdateConfig(
      req.body?.bulkUpdateConfig,
    );
    const nextConfig = { ...data, bulkUpdateConfig };
    await fs.writeFile(file, JSON.stringify(nextConfig, null, 2));
    res.json({ ok: true, bulkUpdateConfig });
  } catch (err) {
    next(err);
  }
});

export default router;
