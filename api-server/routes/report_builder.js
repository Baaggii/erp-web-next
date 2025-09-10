import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middlewares/auth.js';
import {
  listDatabaseTables,
  listTableColumnsDetailed,
  saveStoredProcedure,
  saveView,
  listReportProcedures,
  deleteProcedure,
} from '../../db/index.js';

const PROTECTED_PROCEDURE_PREFIXES = ['dynrep_'];

async function isProtectedProcedure(name) {
  if (!name) return false;
  if (PROTECTED_PROCEDURE_PREFIXES.some((p) => name.startsWith(p))) {
    return true;
  }
  const dir = path.join(
    process.cwd(),
    'config',
    '0',
    'report_builder',
    'procedures',
  );
  try {
    await fs.access(path.join(dir, `${name}.json`));
    return true;
  } catch {}
  try {
    await fs.access(path.join(dir, `${name}.sql`));
    return true;
  } catch {}
  return false;
}

function extractProcedureName(sql) {
  const match = sql.match(/CREATE\s+PROCEDURE\s+`?([^\s`(]+)`?/i);
  return match ? match[1] : null;
}

function tenantDir(companyId = 0) {
  return path.join(
    process.cwd(),
    'config',
    String(companyId),
    'report_builder',
  );
}

async function resolveDir(companyId = 0) {
  const dir = tenantDir(companyId);
  try {
    await fs.access(dir);
    return { path: dir, isDefault: companyId === 0 };
  } catch {
    return { path: null, isDefault: companyId === 0 };
  }
}

function tenantProcDir(companyId = 0) {
  return path.join(tenantDir(companyId), 'procedures');
}

async function resolveProcDir(companyId = 0) {
  const dir = tenantProcDir(companyId);
  try {
    await fs.access(dir);
    return { path: dir, isDefault: companyId === 0 };
  } catch {
    return { path: null, isDefault: companyId === 0 };
  }
}

const router = express.Router();

// List database tables
router.get('/tables', requireAuth, async (req, res, next) => {
  try {
    const tables = await listDatabaseTables();
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

// List fields for a specific table
router.get('/fields', requireAuth, async (req, res, next) => {
  try {
    const { table } = req.query;
    if (!table) return res.status(400).json({ message: 'table required' });
    const fields = await listTableColumnsDetailed(table);
    res.json({ fields });
  } catch (err) {
    next(err);
  }
});

// List stored procedures
router.get('/procedures', requireAuth, async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const names = (await listReportProcedures()).filter((n) => {
      const parts = n.split('_');
      return parts[1] === '0' || parts[1] === String(companyId);
    });

    // Determine which procedures are default by checking procedure files
    const tenantDirPath = tenantProcDir(companyId);
    const defaultDirPath = tenantProcDir(0);

    const map = new Map();
    const tenantFiles = await fs.readdir(tenantDirPath).catch(() => []);
    tenantFiles
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => map.set(f.replace(/\.json$/, ''), false));
    const defaultFiles = await fs.readdir(defaultDirPath).catch(() => []);
    defaultFiles
      .filter((f) => f.endsWith('.json'))
      .forEach((f) => {
        const name = f.replace(/\.json$/, '');
        if (!map.has(name)) map.set(name, true);
      });

    const list = names.map((name) => ({ name, isDefault: map.get(name) ?? false }));

    res.json({ names: list });
  } catch (err) {
    next(err);
  }
});

// Save a stored procedure
router.post('/procedures', requireAuth, async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    const name = extractProcedureName(sql);
    if (await isProtectedProcedure(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    await saveStoredProcedure(sql);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Delete a stored procedure
router.delete('/procedures/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    if (await isProtectedProcedure(name))
      return res.status(403).json({ message: 'Procedure not allowed' });
    await deleteProcedure(name);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Save a view
router.post('/views', requireAuth, async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    await saveView(sql);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Save generated stored procedure SQL to host
router.post('/procedure-files/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const { sql } = req.body || {};
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    if (!name) return res.status(400).json({ message: 'name required' });
    if (!sql) return res.status(400).json({ message: 'sql required' });
    const dir = tenantProcDir(companyId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${name}.json`);
    await fs.writeFile(file, JSON.stringify({ sql }, null, 2));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List stored procedure files on host
router.get('/procedure-files', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '' } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { path: dir, isDefault } = await resolveProcDir(companyId);
    if (!dir) return res.json({ names: [] });
    const files = await fs.readdir(dir).catch(() => []);
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter(
        (n) =>
          typeof n === 'string' &&
          (!prefix || n.toLowerCase().includes(prefix.toLowerCase())),
      )
      .map((name) => ({ name, isDefault }));

    res.json({ names });
  } catch (err) {
    next(err);
  }
});

// List default stored procedure files on host
router.get('/procedure-files/defaults', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '' } = req.query;
    const { path: dir } = await resolveProcDir(0);
    if (!dir) return res.json({ names: [] });
    const files = await fs.readdir(dir).catch(() => []);
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter(
        (n) =>
          typeof n === 'string' &&
          (!prefix || n.toLowerCase().includes(prefix.toLowerCase())),
      )
      .map((name) => ({ name, isDefault: true }));
    res.json({ names });
  } catch (err) {
    next(err);
  }
});

// Load a stored procedure file from host
router.get('/procedure-files/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const dir = tenantProcDir(companyId);
    const text = await fs.readFile(path.join(dir, `${name}.json`), 'utf-8');
    const data = JSON.parse(text);
    return res.json({ ...data, isDefault: companyId === 0 });
  } catch (err) {
    if (err.code === 'ENOENT')
      return res.status(404).json({ message: 'Procedure file not found' });
    next(err);
  }
});

// Import a default stored procedure file into tenant directory
router.post(
  '/procedure-files/:name/import',
  requireAuth,
  async (req, res, next) => {
    try {
      const { name } = req.params;
      const companyId = Number(req.query.companyId ?? req.user.companyId);
      if (!name) return res.status(400).json({ message: 'name required' });

      const srcDir = tenantProcDir(0);
      const destDir = tenantProcDir(companyId);
      await fs.mkdir(destDir, { recursive: true });
      await fs.copyFile(
        path.join(srcDir, `${name}.json`),
        path.join(destDir, `${name}.json`),
      );

      res.json({ ok: true });
    } catch (err) {
      next(err);
    }
  },
);

// Save report definition to host
router.post('/configs/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    if (!name) return res.status(400).json({ message: 'name required' });
    const dir = tenantDir(companyId);
    await fs.mkdir(dir, { recursive: true });
    const file = path.join(dir, `${name}.json`);
    await fs.writeFile(file, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List saved report definitions
router.get('/configs', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '' } = req.query;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const { path: dir, isDefault } = await resolveDir(companyId);
    const files = dir ? await fs.readdir(dir).catch(() => []) : [];
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .filter(
        (n) =>
          typeof n === 'string' &&
          (!prefix || n.toLowerCase().includes(prefix.toLowerCase())),
      );
    res.json({ names, isDefault });
  } catch (err) {
    next(err);
  }
});

// Load a saved report definition
router.get('/configs/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const dir = tenantDir(companyId);
    const text = await fs.readFile(path.join(dir, `${name}.json`), 'utf-8');
    return res.json(JSON.parse(text));
  } catch (err) {
    if (err.code === 'ENOENT')
      return res.status(404).json({ message: 'Config not found' });
    next(err);
  }
});

export default router;

