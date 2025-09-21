import {
  listDatabaseTables,
  listTableRows,
  updateTableRow,
  insertTableRow,
  deleteTableRow,
  deleteTableRowCascade,
  listRowReferences,
  listTableRelationships,
  listTableColumns,
  listTableColumnMeta,
  pool,
  getPrimaryKeyColumns,
  getEmploymentSession,
} from '../../db/index.js';
import { moveImagesToDeleted } from '../services/transactionImageService.js';
import { addMappings } from '../services/headerMappings.js';
import { hasAction } from '../utils/hasAction.js';
import { createCompanyHandler } from './companyController.js';
import {
  listCustomTableRelations,
  setCustomTableRelation,
  removeCustomTableRelation,
} from '../services/tableRelationsConfig.js';
let bcrypt;
try {
  const mod = await import('bcryptjs');
  bcrypt = mod.default || mod;
} catch {
  bcrypt = { hash: async (s) => s };
}
import { formatDateForDb } from '../utils/formatDate.js';

export async function getTables(req, res, next) {
  try {
    const tables = await listDatabaseTables();
    res.json(tables);
  } catch (err) {
    next(err);
  }
}

export async function getTableRows(req, res, next) {
  const controller = new AbortController();
  req.on('close', () => controller.abort());
  try {
    const {
      page,
      perPage,
      sort,
      dir,
      debug,
      search,
      searchColumns,
      company_id, // eslint-disable-line camelcase
      ...filters
    } = req.query;
    const rowsPerPage = Math.min(Number(perPage) || 50, 500);
    const result = await listTableRows(
      req.params.table,
      {
        page: Number(page) || 1,
        perPage: rowsPerPage,
        filters: {
          ...filters,
          company_id:
            company_id !== undefined && company_id !== ''
              ? company_id
              : req.user?.companyId,
        },
        search: search || '',
        searchColumns: typeof searchColumns === 'string' ? searchColumns.split(',') : [],
        sort: { column: sort, dir },
        debug: debug === '1' || debug === 'true',
      },
      controller.signal,
    );
    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTableRelations(req, res, next) {
  try {
    const [dbRelations, custom] = await Promise.all([
      listTableRelationships(req.params.table),
      listCustomTableRelations(req.params.table, req.user?.companyId),
    ]);
    const merged = new Map();
    for (const rel of dbRelations || []) {
      const column = String(rel?.COLUMN_NAME || '').toLowerCase();
      if (!column) continue;
      merged.set(column, { ...rel, isCustom: false });
    }
    for (const rel of custom.relations || []) {
      const column = String(rel?.COLUMN_NAME || '').toLowerCase();
      if (!column) continue;
      merged.set(column, { ...rel, isCustom: true });
    }
    res.json(Array.from(merged.values()));
  } catch (err) {
    next(err);
  }
}

export async function getCustomTableRelations(req, res, next) {
  try {
    const { relations } = await listCustomTableRelations(
      req.params.table,
      req.user?.companyId,
    );
    res.json(relations);
  } catch (err) {
    next(err);
  }
}

export async function saveTableRelation(req, res, next) {
  try {
    const { column, referencedTable, referencedColumn } = req.body || {};
    if (!column || !referencedTable || !referencedColumn) {
      return res.status(400).json({
        message: 'Column, referencedTable, and referencedColumn are required',
      });
    }
    const relation = await setCustomTableRelation(
      req.params.table,
      column,
      { referencedTable, referencedColumn },
      req.user?.companyId,
    );
    res.json(relation);
  } catch (err) {
    if (/requires table, column, referencedTable, and referencedColumn/.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
}

export async function deleteTableRelation(req, res, next) {
  try {
    const column = req.params.column;
    if (!column) {
      return res.status(400).json({ message: 'Column parameter is required' });
    }
    await removeCustomTableRelation(req.params.table, column, req.user?.companyId);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function getTableColumnsMeta(req, res, next) {
  try {
    const cols = await listTableColumnMeta(req.params.table);
    res.json(cols);
  } catch (err) {
    next(err);
  }
}

export async function updateRow(req, res, next) {
  try {
    let original;
    try {
      const pkCols = await getPrimaryKeyColumns(req.params.table);
      if (pkCols.length > 0) {
        const parts = String(req.params.id).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [rows] = await pool.query(
          `SELECT * FROM \`${req.params.table}\` WHERE ${where} LIMIT 1`,
          parts,
        );
        original = rows[0];
      }
    } catch {}
    if (original) res.locals.logDetails = original;
    const updates = { ...req.body };
    delete updates.created_by;
    delete updates.created_at;
    const columns = await listTableColumns(req.params.table);
    if (columns.includes('updated_by')) updates.updated_by = req.user.empid;
    if (columns.includes('updated_at')) {
      updates.updated_at = formatDateForDb(new Date());
    }
    if (req.params.table === 'users' && updates.password) {
      updates.password = await bcrypt.hash(updates.password, 10);
    }
    await updateTableRow(
      req.params.table,
      req.params.id,
      updates,
      req.user.companyId,
    );
    res.sendStatus(204);
  } catch (err) {
    if (/Can't update table .* in stored function\/trigger/i.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
}

export async function addRow(req, res, next) {
  try {
    if (req.params.table === 'companies') {
      return createCompanyHandler(req, res, next);
    }
    const columns = await listTableColumns(req.params.table);
    const row = { ...req.body };
    if (columns.includes('created_by')) row.created_by = req.user?.empid;
    if (columns.includes('created_at')) {
      row.created_at = formatDateForDb(new Date());
    }
    if (columns.includes('company_id')) {
      row.company_id = req.user.companyId;
    }
    if (req.params.table === 'users' && row.password) {
      row.password = await bcrypt.hash(row.password, 10);
    }
    if (columns.includes('g_burtgel_id') && row.g_burtgel_id == null) {
      row.g_burtgel_id = row.g_id ?? 0;
    }
    const result = await insertTableRow(req.params.table, row);
    res.locals.insertId = result?.id;
    res.status(201).json(result);
  } catch (err) {
    if (/Can't update table .* in stored function\/trigger/i.test(err.message)) {
      return res.status(400).json({ message: err.message });
    }
    next(err);
  }
}

export async function deleteRow(req, res, next) {
  try {
    const table = req.params.table;
    const id = req.params.id;
    let row;
    try {
      const pkCols = await getPrimaryKeyColumns(table);
      if (pkCols.length > 0) {
        const parts = String(id).split('-');
        const where = pkCols.map((c) => `\`${c}\` = ?`).join(' AND ');
        const [rows] = await pool.query(
          `SELECT * FROM \`${table}\` WHERE ${where} LIMIT 1`,
          parts,
        );
        row = rows[0];
      }
    } catch {}
    if (row) res.locals.logDetails = row;
    if (req.query.cascade === 'true') {
      await deleteTableRowCascade(table, id, req.user.companyId);
    } else {
      await deleteTableRow(
        table,
        id,
        req.user.companyId,
        undefined,
        req.user?.empid,
      );
    }
    if (row) {
      try {
        await moveImagesToDeleted(table, row);
      } catch {}
    }
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}

export async function getRowReferences(req, res, next) {
  try {
    const refs = await listRowReferences(req.params.table, req.params.id);
    res.json(refs);
  } catch (err) {
    next(err);
  }
}

export async function saveColumnLabels(req, res, next) {
  try {
    const session = await getEmploymentSession(
      req.user.empid,
      req.user.companyId,
    );
    if (!(await hasAction(session, 'system_settings'))) return res.sendStatus(403);
    const labels = req.body.labels || {};
    await addMappings(labels);
    res.sendStatus(204);
  } catch (err) {
    next(err);
  }
}
