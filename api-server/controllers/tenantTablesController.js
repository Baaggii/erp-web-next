import {
  listTenantTables as listTenantTablesDb,
  upsertTenantTable,
  getEmploymentSession,
  listAllTenantTableOptions,
  getTenantTable as getTenantTableDb,
  zeroSharedTenantKeys,
  seedDefaultsForSeedTables,
  seedTenantTables,
  listCompanies,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';
import { GLOBAL_COMPANY_ID } from '../../config/0/constants.js';

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

export async function getTenantTable(req, res, next) {
  try {
    const tableName = req.params.table_name;
    if (!tableName) {
      return res.status(400).json({ message: 'table_name is required' });
    }
    const table = await getTenantTableDb(tableName);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    res.json(table);
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
    await zeroSharedTenantKeys(req.user.empid);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function seedDefaults(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    await seedDefaultsForSeedTables(req.user.empid);
    res.sendStatus(204);
  } catch (err) {
    if (err?.status === 409 && err?.conflicts) {
      res.status(409).json({
        message:
          err.message ||
          'Cannot populate defaults because tenant data exists in seed tables.',
        conflicts: err.conflicts,
      });
      return;
    }
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
    const companies = await listCompanies(req.user.empid);
    const results = {};
    for (const { id, created_by } of companies) {
      if (id === GLOBAL_COMPANY_ID) continue;
      if (created_by !== req.user.empid) continue;
      const summary = await seedTenantTables(
        id,
        tables,
        recordMap,
        overwrite,
        req.user.empid,
      );
      results[id] = summary || {};
    }
    res.json(results);
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

    const companies = await listCompanies(req.user.empid);
    const company = companies.find((c) => c.id === Number(companyId));
    if (!company || company.created_by !== req.user.empid) {
      return res.sendStatus(403);
    }

    const summary = await seedTenantTables(
      companyId,
      tables,
      recordMap,
      overwrite,
      req.user.empid,
    );
    res.json(summary || {});
  } catch (err) {
    next(err);
  }
}
