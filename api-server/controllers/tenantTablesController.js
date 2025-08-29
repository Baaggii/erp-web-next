import {
  listTenantTables as listTenantTablesDb,
  upsertTenantTable,
  getEmploymentSession,
  listAllTenantTableOptions,
  zeroSharedTenantKeys,
  seedDefaultsForSeedTables,
  seedTenantTables,
  listCompanies,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';
import { GLOBAL_COMPANY_ID } from '../../config/constants.js';

export async function listTenantTables(req, res, next) {
  try {
    const tables = await listTenantTablesDb();
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

export async function listTenantTableOptions(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const tables = await listAllTenantTableOptions();
    res.json(tables);
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
    const userId = req.user?.empid;
    const result = await upsertTenantTable(
      tableName,
      isShared,
      seedOnCreate,
      userId,
      userId,
    );
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
    const userId = req.user?.empid;
    const result = await upsertTenantTable(
      tableName,
      isShared,
      seedOnCreate,
      null,
      userId,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function resetSharedTenantKeys(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    await zeroSharedTenantKeys();
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function seedDefaults(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    await seedDefaultsForSeedTables();
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function seedExistingCompanies(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const { tables = null, records = [], overwrite = false } = req.body || {};
    const recordMap = {};
    for (const rec of records || []) {
      if (rec?.table && Array.isArray(rec.ids) && rec.ids.length > 0) {
        recordMap[rec.table] = rec.ids;
      }
    }
    const companies = await listCompanies();
    for (const { id } of companies) {
      if (id === GLOBAL_COMPANY_ID) continue;
      await seedTenantTables(id, tables, recordMap, overwrite);
    }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function seedCompany(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const { companyId, tables = null, records = [], overwrite = false } =
      req.body || {};
    if (!companyId) {
      return res.status(400).json({ message: 'companyId is required' });
    }
    const recordMap = {};
    for (const rec of records || []) {
      if (
        rec?.table &&
        Array.isArray(rec.rows) &&
        rec.rows.length > 0
      ) {
        recordMap[rec.table] = rec.rows;
      } else if (
        rec?.table &&
        Array.isArray(rec.ids) &&
        rec.ids.length > 0
      ) {
        recordMap[rec.table] = rec.ids;
      }
    }
    await seedTenantTables(companyId, tables, recordMap, overwrite);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
