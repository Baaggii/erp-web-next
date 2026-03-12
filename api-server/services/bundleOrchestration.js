import {
  listModules,
  listCompanyModuleLicenses,
  listTableRows,
  getProcedureParams,
} from '../../db/index.js';
import { getGeneralConfig } from './generalConfig.js';
import { listTransactionNames, getFormConfig } from './transactionFormConfig.js';
import { getDisplayFields } from './displayFieldConfig.js';
import { listPermittedProcedures } from '../utils/reportProcedures.js';
import { withCache } from './bundleCache.js';
import { listTableRelationships } from '../../db/index.js';
import { listCustomRelations } from './tableRelationsConfig.js';
import { pool } from '../../db/index.js';
import { queryWithTenantScope } from './tenantScope.js';

function toInt(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function normalizeIds(ids) {
  if (Array.isArray(ids)) return ids.map((id) => String(id).trim()).filter(Boolean);
  if (typeof ids === 'string') return ids.split(',').map((id) => id.trim()).filter(Boolean);
  return [];
}

export async function loadBootstrapBundle({ user, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const userLevelId = user?.userLevel ?? user?.userlevel_id ?? user?.userlevelId ?? null;

  return withCache(
    ['bootstrap', companyId, userLevelId],
    async () => {
      const [{ config: generalConfig }, modules, companyModules] = await Promise.all([
        getGeneralConfig(companyId),
        listModules(userLevelId, companyId),
        listCompanyModuleLicenses(companyId),
      ]);
      return {
        generalConfig,
        modules,
        companyModules,
      };
    },
    { ttlMs: 60_000, tags: ['bootstrap', 'modules'] },
  );
}

export async function loadPageBundle({ user, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const page = String(query.page || 'dashboard').toLowerCase();

  return withCache(
    ['page_bundle', companyId, page, query.branchId, query.departmentId],
    async () => {
      if (page === 'dashboard') {
        const [reportAccess, transactionForms, codeTransactions] = await Promise.all([
          listPermittedProcedures(
            {
              branchId: query.branchId,
              departmentId: query.departmentId,
              prefix: query.prefix || '',
            },
            companyId,
            user,
          ),
          listTransactionNames(
            {
              branchId: query.branchId,
              departmentId: query.departmentId,
              moduleKey: query.moduleKey,
            },
            companyId,
          ),
          listTableRows('code_transaction', {
            page: 1,
            perPage: 200,
            filters: { company_id: companyId },
          }),
        ]);

        return {
          page,
          dashboard: {
            reportProcedures: reportAccess?.procedures || [],
            transactionForms: transactionForms?.names || transactionForms || {},
            codeTransactions: Array.isArray(codeTransactions?.rows) ? codeTransactions.rows : [],
          },
        };
      }
      return { page, data: null };
    },
    { ttlMs: 20_000, tags: ['page:dashboard', 'forms:meta', 'reports'] },
  );
}

export async function loadFormBundle({ user, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const table = String(query.table || '').trim();
  const name = String(query.name || '').trim();
  if (!table || !name) {
    throw new Error('table and name are required');
  }

  return withCache(
    ['form_bundle', companyId, table, name],
    async () => {
      const { config } = await getFormConfig(table, name, companyId);
      const relationRows = await loadRelationsForTable({ companyId, table });

      const targetTables = Array.from(
        new Set(relationRows.map((rel) => rel.REFERENCED_TABLE_NAME).filter(Boolean)),
      );
      const displayFieldEntries = await Promise.all(
        targetTables.map(async (targetTable) => {
          const { config: displayConfig } = await getDisplayFields(targetTable, companyId);
          return [targetTable, displayConfig || {}];
        }),
      );

      return {
        table,
        name,
        formConfig: config,
        relations: relationRows,
        displayFields: Object.fromEntries(displayFieldEntries),
      };
    },
    { ttlMs: 45_000, tags: ['forms:meta', 'relations', 'display_fields'] },
  );
}

async function loadRelationsForTable({ companyId, table }) {
  const [dbRelations, custom] = await Promise.all([
    listTableRelationships(table),
    listCustomRelations(table, companyId),
  ]);

  const rows = Array.isArray(dbRelations)
    ? dbRelations.map((rel) => ({
        COLUMN_NAME: rel.COLUMN_NAME,
        REFERENCED_TABLE_NAME: rel.REFERENCED_TABLE_NAME,
        REFERENCED_COLUMN_NAME: rel.REFERENCED_COLUMN_NAME,
        source: 'database',
      }))
    : [];

  const customEntries = custom?.config ?? {};
  Object.entries(customEntries || {}).forEach(([column, relations]) => {
    if (!Array.isArray(relations)) return;
    relations.forEach((relation) => {
      if (!relation?.table || !relation?.column) return;
      rows.push({
        COLUMN_NAME: column,
        REFERENCED_TABLE_NAME: relation.table,
        REFERENCED_COLUMN_NAME: relation.column,
        source: 'custom',
        filterColumn: relation.filterColumn,
        filterValue: relation.filterValue,
      });
    });
  });

  return rows;
}

export async function loadRelationBundle({ user, table, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const relationTable = String(query.relationTable || '').trim();
  const relationColumn = String(query.relationColumn || 'id').trim();
  const search = String(query.search || '').trim();
  const cursor = toInt(query.cursor, 0);
  const limit = Math.min(Math.max(toInt(query.limit, 20), 1), 100);
  const ids = normalizeIds(query.ids);

  const cacheKey = ['relation_bundle', companyId, table, relationTable, relationColumn, search, cursor, limit, ids.join(',')];
  return withCache(
    cacheKey,
    async () => {
      if (!relationTable) {
        return { rows: [], nextCursor: null, selectedRows: [] };
      }

      const where = [];
      const params = [];
      if (search) {
        where.push('CAST(?? AS CHAR) LIKE ?');
        params.push(relationColumn, `%${search}%`);
      }

      let sql = 'SELECT * FROM {{table}}';
      if (where.length) sql += ` WHERE ${where.join(' AND ')}`;
      sql += ' ORDER BY ?? ASC LIMIT ? OFFSET ?';
      params.push(relationColumn, limit, cursor);
      const [rows] = await queryWithTenantScope(pool, relationTable, companyId, sql, params);
      const nextCursor = Array.isArray(rows) && rows.length === limit ? cursor + limit : null;

      let selectedRows = [];
      if (ids.length) {
        const placeholders = ids.map(() => '?').join(',');
        const [selected] = await queryWithTenantScope(
          pool,
          relationTable,
          companyId,
          `SELECT * FROM {{table}} WHERE ?? IN (${placeholders})`,
          [relationColumn, ...ids],
        );
        selectedRows = Array.isArray(selected) ? selected : [];
      }

      return {
        table,
        relationTable,
        relationColumn,
        rows: Array.isArray(rows) ? rows : [],
        selectedRows,
        nextCursor,
      };
    },
    { ttlMs: 15_000, tags: ['relations', 'display_fields'] },
  );
}

export async function loadTableBundle({ user, table, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const page = Math.max(toInt(query.page, 1), 1);
  const perPage = Math.min(Math.max(toInt(query.perPage, 50), 1), 200);
  const search = query.search || '';
  const result = await listTableRows(table, {
    page,
    perPage,
    search,
    filters: { company_id: companyId },
    sort: { column: query.sort, dir: query.dir },
  });
  return {
    table,
    page,
    perPage,
    cursor: page,
    rows: result?.rows || [],
    total: result?.total || 0,
    totalPages: result?.totalPages || 0,
  };
}

export async function loadReportBundle({ user, reportKey, query = {} }) {
  const companyId = Number(query.companyId ?? user?.companyId ?? 0);
  const branchId = query.branchId;
  const departmentId = query.departmentId;

  return withCache(
    ['report_bundle', companyId, reportKey, branchId, departmentId],
    async () => {
      const { procedures } = await listPermittedProcedures(
        { branchId, departmentId, prefix: query.prefix || '' },
        companyId,
        user,
      );
      const match = procedures.find((proc) => String(proc?.name || '') === String(reportKey || ''));
      const params = match ? await getProcedureParams(match.name) : [];
      return {
        reportKey,
        procedure: match || null,
        parameters: params || [],
      };
    },
    { ttlMs: 30_000, tags: ['reports'] },
  );
}
