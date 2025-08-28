import {
  listTenantTables as listTenantTablesDb,
  upsertTenantTable,
  getEmploymentSession,
  listDatabaseTables,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';

export async function listTenantTables(req, res, next) {
  try {
    const tables = await listTenantTablesDb();
    if (!tables.length) {
      const dbTables = await listDatabaseTables();
      const mapped = dbTables
        .filter((t) => t !== 'tenant_tables')
        .map((table_name) => ({
          table_name,
          is_shared: false,
          seed_on_create: false,
        }));
      return res.json(mapped);
    }
    const mappedExisting = tables.map((t) => ({
      table_name: t.table_name ?? t.tableName,
      is_shared: t.is_shared ?? t.isShared,
      seed_on_create: t.seed_on_create ?? t.seedOnCreate,
    }));
    res.json(mappedExisting);
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
