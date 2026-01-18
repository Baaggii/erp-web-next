import buildStoredProcedure from './buildStoredProcedure.js';

function normalizeTenantFlags(flags) {
  if (Array.isArray(flags)) {
    return flags.reduce((acc, item) => {
      if (!item?.tableName) return acc;
      acc[item.tableName] = {
        isShared: item.isShared,
        seedOnCreate: item.seedOnCreate,
      };
      return acc;
    }, {});
  }
  return flags || {};
}

function extractTablesFromFragment(fragment, knownTables) {
  if (!fragment || !knownTables?.length) return [];
  const matches = [];
  knownTables.forEach((table) => {
    const re = new RegExp(`\\b${table}\\b`, 'i');
    if (re.test(fragment)) matches.push(table);
  });
  return matches;
}

function collectTableEntries(definition, knownTables = []) {
  const entries = [];
  if (definition?.from?.table) {
    entries.push({
      table: definition.from.table,
      alias: definition.from.alias,
    });
    if (/\s|\(|\)/.test(definition.from.table)) {
      extractTablesFromFragment(definition.from.table, knownTables).forEach(
        (table) => {
          entries.push({ table, alias: definition.from.alias });
        },
      );
    }
  }
  (definition?.joins || []).forEach((join) => {
    if (!join?.table) return;
    entries.push({ table: join.table, alias: join.alias });
    if (/\s|\(|\)/.test(join.table)) {
      extractTablesFromFragment(join.table, knownTables).forEach((table) => {
        entries.push({ table, alias: join.alias });
      });
    }
  });
  return entries;
}

function cloneDefinition(definition) {
  if (!definition) return definition;
  return {
    ...definition,
    from: definition.from ? { ...definition.from } : definition.from,
    joins: definition.joins ? definition.joins.map((join) => ({ ...join })) : [],
    where: definition.where ? definition.where.map((w) => ({ ...w })) : [],
    unions: definition.unions
      ? definition.unions.map((unionDef) => cloneDefinition(unionDef))
      : [],
  };
}

function appendSharedFilters(definition, sharedTables, sessionParamName) {
  const entries = collectTableEntries(definition);
  const filters = new Set();
  entries.forEach(({ table, alias }) => {
    if (!sharedTables.has(table)) return;
    const ref = alias || table;
    if (!ref) return;
    filters.add(`${ref}.company_id IN (0, ${sessionParamName})`);
  });

  if (!filters.size) return definition;

  const where = [...(definition.where || [])];
  filters.forEach((expr) => {
    where.push({ expr, connector: 'AND' });
  });
  return { ...definition, where };
}

/**
 * Build a stored procedure with tenant table normalization.
 * @param {Object} definition
 * @param {string} definition.name
 * @param {Array<{name:string,type:string}>} [definition.params]
 * @param {Object} definition.report
 * @param {Object|Array} [definition.tenantTableFlags]
 * @param {string} [definition.prefix]
 * @param {string} [definition.sessionParamName]
 * @param {string} [definition.tempTablePrefix]
 * @param {boolean} [definition.applySharedFilters]
 * @param {Object} [definition.logger]
 * @returns {string}
 */
export default function buildTenantNormalizedProcedure(definition = {}) {
  const {
    name,
    params = [],
    report,
    prefix = '',
    config,
    tenantTableFlags,
    sessionParamName = 'session_company_id',
    tempTablePrefix = 'tmp_',
    applySharedFilters = true,
    logger = console,
  } = definition;

  if (!name) throw new Error('procedure name is required');
  if (!report) throw new Error('report definition is required');

  const flagsMap = normalizeTenantFlags(tenantTableFlags);
  const knownTables = Object.keys(flagsMap || {});
  const allEntries = [
    ...collectTableEntries(report, knownTables),
    ...((report?.unions || []).flatMap((unionDef) =>
      collectTableEntries(unionDef, knownTables),
    )),
  ];

  const uniqueTables = Array.from(
    new Set(allEntries.map((entry) => entry.table).filter(Boolean)),
  );

  const tableReplacements = {};
  const preStatements = [];
  const sharedTables = new Set();

  uniqueTables.forEach((table) => {
    const flags = flagsMap?.[table];
    if (!flags) {
      logger?.warn?.(
        `Tenant normalization: table ${table} not found in tenant_tables registry.`,
      );
      return;
    }
    const isShared = flags.isShared === true || flags.isShared === 1;
    if (isShared) {
      sharedTables.add(table);
      return;
    }
    const tempName = `${tempTablePrefix}${table}`;
    tableReplacements[table] = tempName;
    preStatements.push(
      `CALL create_tenant_temp_table('${table}', '${tempName}', ${sessionParamName})`,
    );
  });

  const baseReport = cloneDefinition(report);
  const normalizedReport = applySharedFilters
    ? appendSharedFilters(baseReport, sharedTables, sessionParamName)
    : baseReport;

  const normalizedUnions = normalizedReport.unions || [];
  const nextUnions = normalizedUnions.map((unionDef) =>
    applySharedFilters
      ? appendSharedFilters(unionDef, sharedTables, sessionParamName)
      : unionDef,
  );
  normalizedReport.unions = nextUnions;

  const nextParams = [...params];
  if (!nextParams.some((p) => p.name === sessionParamName)) {
    nextParams.push({ name: sessionParamName, type: 'INT' });
  }

  return buildStoredProcedure({
    name,
    params: nextParams,
    report: normalizedReport,
    prefix,
    config,
    reportSqlOptions: { tableReplacements },
    preStatements,
  });
}
