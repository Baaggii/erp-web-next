import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middlewares/auth.js';
import { requireAdmin } from '../middlewares/admin.js';
import {
  listDatabaseTables,
  listTableColumnsDetailed,
  saveStoredProcedure,
  saveView,
  listReportProcedures,
  deleteProcedure,
  getStoredProcedureSql,
  getProcedureSql,
  listDatabaseViews,
  getViewSql,
  deleteView,
} from '../../db/index.js';
import { generateProcedureConfig } from '../utils/generateProcedureConfig.js';

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
  const files = await fs.readdir(dir).catch(() => []);
  return { path: dir, files, isDefault: companyId === 0 };
}

function tenantProcDir(companyId = 0) {
  return path.join(tenantDir(companyId), 'procedures');
}

async function resolveProcDir(companyId = 0) {
  const dir = tenantProcDir(companyId);
  const files = await fs.readdir(dir).catch(() => []);
  return { path: dir, files, isDefault: companyId === 0 };
}

const router = express.Router();
router.use(requireAuth, requireAdmin);

// List database tables
router.get('/tables', async (req, res, next) => {
  try {
    const tables = await listDatabaseTables();
    res.json({ tables });
  } catch (err) {
    next(err);
  }
});

// List fields for a specific table
router.get('/fields', async (req, res, next) => {
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
router.get('/procedures', async (req, res, next) => {
  try {
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const prefix = req.query.prefix || '';

    const names = await listReportProcedures(prefix);

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
router.post('/procedures', async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    const name = extractProcedureName(sql);
    await saveStoredProcedure(sql, { allowProtected: true });
    res.json({ ok: true });
  } catch (err) {
    res.status(err.status || 400).json({ message: err.message });
  }
});

// Get a stored procedure SQL
router.get('/procedures/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    let sql = await getStoredProcedureSql(name);
    if (!sql) {
      sql = await getProcedureSql(name);
    }
    if (!sql) return res.status(404).json({ message: 'Procedure not found' });
    res.json({ sql });
  } catch (err) {
    next(err);
  }
});

// Generate and save config from a stored procedure
router.post(
  '/procedures/:name/config',
  async (req, res, next) => {
    try {
      const { name } = req.params;
      const companyId = Number(req.query.companyId ?? req.user.companyId);
      let sql = await getStoredProcedureSql(name);
      if (!sql) {
        sql = await getProcedureSql(name);
      }
      if (!sql) return res.status(404).json({ message: 'Procedure not found' });
      const config = await generateProcedureConfig(name, sql, companyId);
      res.json({ ok: true, config });
    } catch (err) {
      next(err);
    }
  },
);

// Delete a stored procedure
router.delete('/procedures/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    await deleteProcedure(name, { allowProtected: true });
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// Save a view
router.post('/views', async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    await saveView(sql);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

router.get('/views', async (req, res, next) => {
  try {
    const { prefix = '' } = req.query;
    const names = await listDatabaseViews(prefix);
    res.json({ names });
  } catch (err) {
    next(err);
  }
});

router.get('/views/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    const sql = await getViewSql(name);
    if (!sql) return res.status(404).json({ message: 'View not found' });
    res.json({ sql });
  } catch (err) {
    next(err);
  }
});

router.delete('/views/:name', async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    await deleteView(name);
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
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const dir = tenantProcDir(companyId);
    const files = await fs.readdir(dir).catch(() => []);
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .map((name) => ({ name, isDefault: companyId === 0 }));

    res.json({ names });
  } catch (err) {
    next(err);
  }
});

// List default stored procedure files on host
router.get('/procedure-files/defaults', requireAuth, async (req, res, next) => {
  try {
    const { prefix = '' } = req.query;
    const { files } = await resolveProcDir(0);
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
    const companyId = Number(req.query.companyId ?? req.user.companyId);
    const dir = tenantDir(companyId);
    const files = await fs.readdir(dir).catch(() => []);
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    res.json({ names, isDefault: companyId === 0 });
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
