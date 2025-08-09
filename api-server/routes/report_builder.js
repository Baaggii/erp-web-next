import express from 'express';
import path from 'path';
import fs from 'fs/promises';
import { requireAuth } from '../middlewares/auth.js';
import {
  listDatabaseTables,
  listTableColumns,
  saveStoredProcedure,
  saveView,
} from '../../db/index.js';

const router = express.Router();
const CONFIG_DIR = path.join(process.cwd(), 'uploads', 'report_builder');
const PROC_DIR = path.join(CONFIG_DIR, 'procedures');

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
    const fields = await listTableColumns(table);
    res.json({ fields });
  } catch (err) {
    next(err);
  }
});

// Save a stored procedure
router.post('/procedures', requireAuth, async (req, res, next) => {
  try {
    const { sql } = req.body || {};
    if (!sql) return res.status(400).json({ message: 'sql required' });
    await saveStoredProcedure(sql);
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
    const { sql, definition } = req.body || {};
    if (!name) return res.status(400).json({ message: 'name required' });
    if (!sql) return res.status(400).json({ message: 'sql required' });
    await fs.mkdir(PROC_DIR, { recursive: true });
    const file = path.join(PROC_DIR, `${name}.json`);
    await fs.writeFile(file, JSON.stringify({ sql, definition }, null, 2));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List stored procedure files on host
router.get('/procedure-files', requireAuth, async (req, res, next) => {
  try {
    await fs.mkdir(PROC_DIR, { recursive: true });
    const files = await fs.readdir(PROC_DIR);
    const names = files
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''));
    res.json({ names });
  } catch (err) {
    next(err);
  }
});

// Load a stored procedure file from host
router.get('/procedure-files/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const file = path.join(PROC_DIR, `${name}.json`);
    const text = await fs.readFile(file, 'utf-8');
    res.json(JSON.parse(text));
  } catch (err) {
    next(err);
  }
});

// Save report definition to host
router.post('/configs/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ message: 'name required' });
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const file = path.join(CONFIG_DIR, `${name}.json`);
    await fs.writeFile(file, JSON.stringify(req.body || {}, null, 2));
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

// List saved report definitions
router.get('/configs', requireAuth, async (req, res, next) => {
  try {
    await fs.mkdir(CONFIG_DIR, { recursive: true });
    const files = await fs.readdir(CONFIG_DIR);
    const names = files.filter((f) => f.endsWith('.json')).map((f) => f.replace(/\.json$/, ''));
    res.json({ names });
  } catch (err) {
    next(err);
  }
});

// Load a saved report definition
router.get('/configs/:name', requireAuth, async (req, res, next) => {
  try {
    const { name } = req.params;
    const file = path.join(CONFIG_DIR, `${name}.json`);
    const text = await fs.readFile(file, 'utf-8');
    res.json(JSON.parse(text));
  } catch (err) {
    next(err);
  }
});

export default router;

