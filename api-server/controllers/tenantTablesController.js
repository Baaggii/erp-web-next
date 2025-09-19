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
  insertTenantDefaultRow,
  updateTenantDefaultRow as updateTenantDefaultRowDb,
  deleteTenantDefaultRow,
} from '../../db/index.js';
import { hasAction } from '../utils/hasAction.js';
import { GLOBAL_COMPANY_ID } from '../../config/0/constants.js';

const SHARED_SEED_CONFLICT_MESSAGE =
  'Shared tables always read from tenant key 0, so they cannot participate in per-company seeding.';

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
    const sharedFlag = !!isShared;
    const seedFlag = !!seedOnCreate;
    if (sharedFlag && seedFlag) {
      return res.status(400).json({ message: SHARED_SEED_CONFLICT_MESSAGE });
    }
    const userId = req.user?.empid;
    const result = await upsertTenantTable(
      tableName,
      sharedFlag,
      seedFlag,
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
    const sharedFlag = !!isShared;
    const seedFlag = !!seedOnCreate;
    if (sharedFlag && seedFlag) {
      return res.status(400).json({ message: SHARED_SEED_CONFLICT_MESSAGE });
    }
    const userId = req.user?.empid;
    const result = await upsertTenantTable(
      tableName,
      sharedFlag,
      seedFlag,
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
    const result = await zeroSharedTenantKeys(req.user.empid);
    res.json(result);
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
      if (!rec?.table) continue;
      const tableName = String(rec.table);
      if (Array.isArray(rec.rows) && rec.rows.length > 0) {
        const sanitized = [];
        for (const row of rec.rows) {
          if (!row || typeof row !== 'object' || Array.isArray(row)) {
            return res.status(400).json({
              message: `Invalid manual row payload for table ${tableName}`,
            });
          }
          sanitized.push({ ...row });
        }
        if (sanitized.length > 0) {
          recordMap[tableName] = sanitized;
          continue;
        }
      }
      if (Array.isArray(rec.ids) && rec.ids.length > 0) {
        recordMap[tableName] = rec.ids;
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

export async function insertDefaultTenantRow(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const tableName = req.params.table_name;
    if (!tableName) {
      return res.status(400).json({ message: 'table_name is required' });
    }
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ message: 'Body must be an object' });
    }
    if (
      payload.company_id !== undefined &&
      Number(payload.company_id) !== GLOBAL_COMPANY_ID
    ) {
      return res
        .status(400)
        .json({ message: 'company_id must be 0 for default rows' });
    }
    const table = await getTenantTableDb(tableName);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const row = await insertTenantDefaultRow(
      tableName,
      payload,
      req.user.empid,
    );
    res.status(201).json({ row });
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
}

export async function updateDefaultTenantRow(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const tableName = req.params.table_name;
    const rowId = req.params.row_id;
    if (!tableName) {
      return res.status(400).json({ message: 'table_name is required' });
    }
    if (!rowId) {
      return res.status(400).json({ message: 'row_id is required' });
    }
    const payload = req.body;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return res.status(400).json({ message: 'Body must be an object' });
    }
    if (
      payload.company_id !== undefined &&
      Number(payload.company_id) !== GLOBAL_COMPANY_ID
    ) {
      return res
        .status(400)
        .json({ message: 'company_id must be 0 for default rows' });
    }
    const table = await getTenantTableDb(tableName);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    const row = await updateTenantDefaultRowDb(
      tableName,
      rowId,
      payload,
      req.user.empid,
    );
    res.json({ row });
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
}

export async function deleteDefaultTenantRow(req, res, next) {
  try {
    if (!(await ensureAdmin(req))) return res.sendStatus(403);
    const tableName = req.params.table_name;
    const rowId = req.params.row_id;
    if (!tableName) {
      return res.status(400).json({ message: 'table_name is required' });
    }
    if (!rowId) {
      return res.status(400).json({ message: 'row_id is required' });
    }
    const table = await getTenantTableDb(tableName);
    if (!table) {
      return res.status(404).json({ message: 'Table not found' });
    }
    await deleteTenantDefaultRow(tableName, rowId, req.user.empid);
    res.sendStatus(204);
  } catch (err) {
    if (err?.status) {
      res.status(err.status).json({ message: err.message });
      return;
    }
    next(err);
  }
}
