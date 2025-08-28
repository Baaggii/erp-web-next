import {
  listTenantTables as listTenantTablesDb,
  upsertTenantTable,
  getEmploymentSession,
  listDatabaseTables,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

export async function listTenantTables(req, res, next) {
  try {
    let tables = [];
    try {
      tables = await listTenantTablesDb();
    } catch (err) {
      // Ignore errors and fall back to empty list if the query fails
      tables = [];
    }

    const mappedExisting = tables.map((t) => ({
      table_name: t.table_name ?? t.tableName,
      is_shared: t.is_shared ?? t.isShared,
      seed_on_create: t.seed_on_create ?? t.seedOnCreate,
    }));

    let dbTables;
    try {
      dbTables = await listDatabaseTables();
    } catch (err) {
      console.warn('Failed to list database tables', err);
      throw err;
    }

    const existingNames = new Set(mappedExisting.map((t) => t.table_name));
    const unmapped = dbTables
      .filter((t) => t !== 'tenant_tables' && !existingNames.has(t))
      .map((table_name) => ({
        table_name,
        is_shared: false,
        seed_on_create: false,
      }));

    res.json([...mappedExisting, ...unmapped]);
  } catch (err) {
    next(err);
  }
}

async function ensureAdmin(req) {
  const session = await getEmploymentSession(req.user.empid, req.user.companyId);
  return hasAction(session, 'system_settings');
}

export async function createTenantTable(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const { tableName, isShared, seedOnCreate } = req.body || {};
    if (!tableName) {
      return res.status(400).json({ message: 'tableName is required' });
    }
    const result = await upsertTenantTable(tableName, isShared, seedOnCreate);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
}

export async function updateTenantTable(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const tableName = req.params.table_name;
    const { isShared, seedOnCreate } = req.body || {};
    const result = await upsertTenantTable(tableName, isShared, seedOnCreate);
    res.json(result);
  } catch (err) {
    next(err);
  }
}
