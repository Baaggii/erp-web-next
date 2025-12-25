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
  getTableRowById,
  listJsonConversionLogs,
} from '../../db/index.js';
import { moveImagesToDeleted } from '../services/transactionImageService.js';
import { addMappings } from '../services/headerMappings.js';
import { hasAction } from '../utils/hasAction.js';
import { createCompanyHandler } from './companyController.js';
import {
  listCustomRelations,
  saveCustomRelation,
  updateCustomRelationAtIndex,
  updateCustomRelationMatching,
  removeCustomRelation,
  removeCustomRelationAtIndex,
  removeCustomRelationMatching,
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
      includeDeleted,
      ...filters
    } = req.query;
    const rowsPerPage = Math.min(Number(perPage) || 50, 500);
    const includeDeletedFlag =
      includeDeleted === '1' || includeDeleted === 'true';
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
        ...(includeDeletedFlag ? { includeDeleted: true } : {}),
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
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const [dbRelations, custom] = await Promise.all([
      listTableRelationships(req.params.table),
      listCustomRelations(req.params.table, companyId),
    ]);
    const result = Array.isArray(dbRelations)
      ? dbRelations.map((rel) => ({
          COLUMN_NAME: rel.COLUMN_NAME,
          REFERENCED_TABLE_NAME: rel.REFERENCED_TABLE_NAME,
          REFERENCED_COLUMN_NAME: rel.REFERENCED_COLUMN_NAME,
          source: 'database',
        }))
      : [];

    const customEntries = custom?.config ?? {};
    if (customEntries && typeof customEntries === 'object') {
      for (const [column, relations] of Object.entries(customEntries)) {
        if (!Array.isArray(relations)) continue;
        relations.forEach((relation, index) => {
          if (!relation || typeof relation !== 'object') return;
          if (!relation.table || !relation.column) return;
          result.push({
            COLUMN_NAME: column,
            REFERENCED_TABLE_NAME: relation.table,
            REFERENCED_COLUMN_NAME: relation.column,
            source: 'custom',
            configIndex: index,
            ...(relation.idField ? { idField: relation.idField } : {}),
            ...(Array.isArray(relation.displayFields)
              ? { displayFields: relation.displayFields }
              : {}),
            ...(relation.combinationSourceColumn
              ? { combinationSourceColumn: relation.combinationSourceColumn }
              : {}),
            ...(relation.combinationTargetColumn
              ? { combinationTargetColumn: relation.combinationTargetColumn }
              : {}),
            ...(relation.filterColumn ? { filterColumn: relation.filterColumn } : {}),
            ...(relation.filterValue !== undefined && relation.filterValue !== null
              ? { filterValue: relation.filterValue }
              : {}),
          });
        });
      }
    }

    res.json(result);
  } catch (err) {
    next(err);
  }
}

export async function getTableRow(req, res, next) {
  try {
    const { table, id } = req.params;
    const {
      includeDeleted,
      ...rawQuery
    } = req.query || {};
    const includeDeletedFlag =
      includeDeleted === '1' || includeDeleted === 'true';
    const tenantFilters = {};
    for (const key of ['company_id', 'branch_id', 'department_id']) {
      const value = rawQuery[key];
      if (value !== undefined && value !== '') {
        tenantFilters[key] = value;
      }
    }
    const row = await getTableRowById(table, id, {
      tenantFilters,
      includeDeleted: includeDeletedFlag,
      defaultCompanyId: req.user?.companyId,
    });
    if (!row) {
      return res.status(404).json({ message: 'Row not found' });
    }
    res.json(row);
  } catch (err) {
    next(err);
  }
}

export async function listCustomTableRelations(req, res, next) {
  try {
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const { config, isDefault } = await listCustomRelations(
      req.params.table,
      companyId,
    );
    res.json({ relations: config, isDefault });
  } catch (err) {
    next(err);
  }
}

export async function saveCustomTableRelation(req, res, next) {
  try {
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const column = req.params.column;
    if (!column) {
      return res.status(400).json({ message: 'column is required' });
    }
    const { targetTable, targetColumn, idField, displayFields } = req.body || {};
    const combinationSource =
      req.body?.combinationSourceColumn ?? req.body?.combination_source_column;
    const combinationTarget =
      req.body?.combinationTargetColumn ?? req.body?.combination_target_column;
    const filterColumn = req.body?.filterColumn ?? req.body?.filter_column;
    const filterValue = req.body?.filterValue ?? req.body?.filter_value;
    if (!targetTable) {
      return res.status(400).json({ message: 'targetTable is required' });
    }
    if (!targetColumn) {
      return res.status(400).json({ message: 'targetColumn is required' });
    }
    const relationInput = { table: targetTable, column: targetColumn, idField, displayFields };
    if (
      typeof combinationSource === 'string' &&
      combinationSource.trim() &&
      typeof combinationTarget === 'string' &&
      combinationTarget.trim()
    ) {
      relationInput.combinationSourceColumn = combinationSource.trim();
      relationInput.combinationTargetColumn = combinationTarget.trim();
    }
    if (typeof filterColumn === 'string' && filterColumn.trim() && filterValue !== undefined) {
      const valueStr = String(filterValue).trim();
      if (valueStr) {
        relationInput.filterColumn = filterColumn.trim();
        relationInput.filterValue = valueStr;
      }
    }
    const rawIndex = req.body?.index;
    const rawMatch = req.body?.match;
    const index =
      typeof rawIndex === 'string'
        ? Number.parseInt(rawIndex, 10)
        : Number.isInteger(rawIndex)
        ? rawIndex
        : undefined;

    let result;
    if (Number.isInteger(index) && index >= 0) {
      result = await updateCustomRelationAtIndex(
        req.params.table,
        column,
        index,
        relationInput,
        companyId,
      );
    } else if (rawMatch && typeof rawMatch === 'object') {
      result = await updateCustomRelationMatching(
        req.params.table,
        column,
        rawMatch,
        relationInput,
        companyId,
      );
    } else {
      result = await saveCustomRelation(
        req.params.table,
        column,
        relationInput,
        companyId,
      );
    }

    res.json({
      column,
      relation: result.relation,
      index: result.index,
      relations: result.relations,
      source: 'custom',
    });
  } catch (err) {
    next(err);
  }
}

export async function deleteCustomTableRelation(req, res, next) {
  try {
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const column = req.params.column;
    if (!column) {
      return res.status(400).json({ message: 'column is required' });
    }
    const rawIndex = req.query.index ?? req.body?.index;
    const parsedIndex =
      typeof rawIndex === 'string'
        ? Number.parseInt(rawIndex, 10)
        : Number.isInteger(rawIndex)
        ? rawIndex
        : undefined;

    const matchParam =
      req.body?.match && typeof req.body.match === 'object'
        ? req.body.match
        : undefined;
    const queryMatch = {
      targetTable:
        typeof req.query.targetTable === 'string'
          ? req.query.targetTable
          : typeof req.query.target_table === 'string'
          ? req.query.target_table
          : undefined,
      targetColumn:
        typeof req.query.targetColumn === 'string'
          ? req.query.targetColumn
          : typeof req.query.target_column === 'string'
          ? req.query.target_column
          : undefined,
      idField:
        typeof req.query.idField === 'string'
          ? req.query.idField
          : typeof req.query.id_field === 'string'
          ? req.query.id_field
          : undefined,
    };

    const hasQueryMatch = Object.values(queryMatch).some((value) => value);
    const match = matchParam || (hasQueryMatch ? queryMatch : undefined);

    let result;
    if (Number.isInteger(parsedIndex) && parsedIndex >= 0) {
      result = await removeCustomRelationAtIndex(
        req.params.table,
        column,
        parsedIndex,
        companyId,
      );
    } else if (match) {
      result = await removeCustomRelationMatching(req.params.table, column, match, companyId);
    } else {
      result = await removeCustomRelation(req.params.table, column, companyId);
    }

    if (!result || result.removed === null) {
      return res.status(404).json({ message: 'relation mapping not found' });
    }

    res.json({ column, removed: result.removed, index: result.index, relations: result.relations });
  } catch (err) {
    next(err);
  }
}

export async function getTableColumnsMeta(req, res, next) {
  try {
    const companyId = Number(req.query.companyId ?? req.user?.companyId ?? 0);
    const cols = await listTableColumnMeta(req.params.table, companyId);
    let jsonLogs = [];
    try {
      jsonLogs = await listJsonConversionLogs(req.params.table);
    } catch {
      jsonLogs = [];
    }
    const jsonColumns = new Set(
      jsonLogs
        .filter((log) => log?.columnName)
        .map((log) => String(log.columnName).toLowerCase()),
    );
    let candidateKey = [];
    try {
      candidateKey = await getPrimaryKeyColumns(req.params.table);
    } catch (err) {
      if (process.env.NODE_ENV !== 'production') {
        // eslint-disable-next-line no-console
        console.warn('Failed to load candidate key metadata', err);
      }
    }
    const candidateOrdinalMap = new Map();
    candidateKey.forEach((name, idx) => {
      if (name != null) {
        candidateOrdinalMap.set(String(name), idx + 1);
      }
    });
    const normalized = cols.map((col) => {
      const primaryOrdinal =
        col.primaryKeyOrdinal != null && Number.isFinite(Number(col.primaryKeyOrdinal))
          ? Number(col.primaryKeyOrdinal)
          : null;
      const candidateOrdinalRaw = candidateOrdinalMap.get(col.name);
      const candidateKeyOrdinal =
        candidateOrdinalRaw != null && Number.isFinite(Number(candidateOrdinalRaw))
          ? Number(candidateOrdinalRaw)
          : null;
      return {
        ...col,
        primaryKeyOrdinal: primaryOrdinal,
        candidateKeyOrdinal,
        jsonLogged: jsonColumns.has(String(col.name || '').toLowerCase()),
      };
    });
    res.json(normalized);
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
      undefined,
      {
        mutationContext: {
          changedBy: req.user?.empid,
          companyId: req.user.companyId,
        },
      },
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
    const result = await insertTableRow(
      req.params.table,
      row,
      undefined,
      undefined,
      false,
      req.user?.empid ?? null,
      {
        mutationContext: {
          changedBy: req.user?.empid ?? null,
          companyId: req.user.companyId,
        },
      },
    );
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
        req.user?.empid ?? null,
        {
          mutationContext: {
            changedBy: req.user?.empid ?? null,
            companyId: req.user.companyId,
          },
        },
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
