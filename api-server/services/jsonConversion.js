import { pool } from '../../db/index.js';

function escapeId(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildDiagnosticQueries(table, column) {
  const safeColumn = String(column || '').replace(/'/g, "''");
  const safeTable = String(table || '').replace(/'/g, "''");
  return [
    `SELECT * FROM information_schema.triggers WHERE trigger_schema = DATABASE() AND action_statement LIKE '%${safeColumn}%'`,
    `SELECT * FROM information_schema.table_constraints WHERE table_schema = DATABASE() AND table_name = '${safeTable}' AND constraint_type='CHECK'`,
    `SELECT * FROM information_schema.routines WHERE routine_schema = DATABASE() AND routine_definition LIKE '%${safeColumn}%'`,
    `SELECT * FROM information_schema.views WHERE table_schema = DATABASE() AND view_definition LIKE '%${safeColumn}%'`,
  ];
}

export function normalizeColumnsInput(columns = []) {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((col) => {
      if (typeof col === 'string') {
        return { name: col, handleConstraints: true, action: 'convert', customSql: '' };
      }
      if (col && typeof col === 'object') {
        const name = col.name || col.column || col.field;
        if (!name) return null;
        const normalized = String(name);
        const allowedActions = new Set(['convert', 'skip', 'manual', 'companion']);
        const action = allowedActions.has(col.action) ? col.action : 'convert';
        const handleConstraints =
          action === 'convert' &&
          col.handleConstraints !== false &&
          col.handle_constraints !== false &&
          col.resolveConstraints !== false;
        const customSql =
          typeof col.customSql === 'string'
            ? col.customSql
            : typeof col.custom_sql === 'string'
              ? col.custom_sql
              : '';
        return {
          name: normalized,
          handleConstraints: Boolean(handleConstraints),
          action,
          customSql,
        };
      }
      return null;
    })
    .filter((col) => col && col.name);
}

async function ensureLogTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS json_conversion_log (
      id INT AUTO_INCREMENT PRIMARY KEY,
      table_name VARCHAR(255) NOT NULL,
      column_name VARCHAR(255) NOT NULL,
      script_text MEDIUMTEXT NOT NULL,
      run_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      run_by VARCHAR(255)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
  `);
}

async function loadColumnUsage(table, columnNames = []) {
  const normalizedColumns = (columnNames || []).filter(Boolean).map(String);
  const [keyUsage] = await pool.query(
    `SELECT kcu.TABLE_NAME,
            kcu.COLUMN_NAME,
            kcu.CONSTRAINT_NAME,
            kcu.REFERENCED_TABLE_NAME,
            kcu.REFERENCED_COLUMN_NAME,
            tc.CONSTRAINT_TYPE
       FROM information_schema.KEY_COLUMN_USAGE kcu
       LEFT JOIN information_schema.TABLE_CONSTRAINTS tc
         ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
        AND tc.TABLE_NAME = kcu.TABLE_NAME
      WHERE kcu.TABLE_SCHEMA = DATABASE()
        AND kcu.COLUMN_NAME IS NOT NULL
        AND (kcu.TABLE_NAME = ? OR kcu.REFERENCED_TABLE_NAME = ?)`,
    [table, table],
  );
  const [checkUsage] = await pool.query(
    `SELECT ccu.TABLE_NAME,
            ccu.COLUMN_NAME,
            ccu.CONSTRAINT_NAME,
            tc.CONSTRAINT_TYPE
       FROM information_schema.CONSTRAINT_COLUMN_USAGE ccu
       JOIN information_schema.TABLE_CONSTRAINTS tc
         ON tc.CONSTRAINT_NAME = ccu.CONSTRAINT_NAME
        AND tc.TABLE_SCHEMA = ccu.TABLE_SCHEMA
      WHERE ccu.TABLE_SCHEMA = DATABASE()
        AND ccu.COLUMN_NAME IS NOT NULL
        AND ccu.TABLE_NAME = ?`,
    [table],
  );
  const [allTriggers] = await pool.query(
    `SELECT TRIGGER_NAME,
            EVENT_OBJECT_TABLE,
            EVENT_MANIPULATION,
            ACTION_TIMING,
            ACTION_STATEMENT
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()`,
  );
  const triggerRegexes = normalizedColumns.map(
    (col) => [col, new RegExp(`\\b${escapeRegex(col)}\\b`, 'i')],
  );
  const triggers = allTriggers.filter((row) => {
    const statement = String(row.ACTION_STATEMENT || '');
    const matchesColumn = triggerRegexes.some(
      ([col, regex]) => regex.test(statement) || statement.includes(`\`${col}\``),
    );
    return row.EVENT_OBJECT_TABLE === table || matchesColumn;
  });
  const likePatterns = normalizedColumns.map((col) => `%${col}%`);
  if (likePatterns.length === 0) {
    return {
      keyUsage,
      checkUsage,
      triggers,
      routineRefs: [],
      viewRefs: [],
      checkClauses: [],
      columnNames,
    };
  }
  const [checkClauses] = await pool.query(
    `SELECT tc.CONSTRAINT_NAME, cc.CHECK_CLAUSE
       FROM information_schema.TABLE_CONSTRAINTS tc
       JOIN information_schema.CHECK_CONSTRAINTS cc
         ON cc.CONSTRAINT_NAME = tc.CONSTRAINT_NAME
        AND cc.CONSTRAINT_SCHEMA = tc.CONSTRAINT_SCHEMA
      WHERE tc.TABLE_SCHEMA = DATABASE()
        AND tc.TABLE_NAME = ?
        AND tc.CONSTRAINT_TYPE = 'CHECK'`,
    [table],
  );
  const [routineRefs] = await pool.query(
    `SELECT ROUTINE_NAME, ROUTINE_TYPE, ROUTINE_DEFINITION
       FROM information_schema.ROUTINES
      WHERE ROUTINE_SCHEMA = DATABASE()
        AND ROUTINE_DEFINITION IS NOT NULL
        AND (${likePatterns.map(() => 'ROUTINE_DEFINITION LIKE ?').join(' OR ')})`,
    likePatterns,
  );
  const [viewRefs] = await pool.query(
    `SELECT TABLE_NAME, VIEW_DEFINITION
       FROM information_schema.VIEWS
      WHERE TABLE_SCHEMA = DATABASE()
        AND VIEW_DEFINITION IS NOT NULL
        AND (${likePatterns.map(() => 'VIEW_DEFINITION LIKE ?').join(' OR ')})`,
    likePatterns,
  );
  return { keyUsage, checkUsage, triggers, routineRefs, viewRefs, checkClauses, columnNames };
}

function buildConstraintMap(table, columnNames = [], usage = {}) {
  const map = {};
  const ensureEntry = (col) => {
    if (!map[col]) {
      map[col] = {
        constraints: [],
        triggers: [],
        hasBlockingConstraint: false,
        constraintTypes: new Set(),
        blockingReasons: new Set(),
        primaryKey: false,
      };
    }
    return map[col];
  };
  const matchesColumnRef = (text, col) => {
    if (!text) return false;
    const normalized = String(text).toLowerCase();
    const needle = String(col || '').toLowerCase();
    return (
      normalized.includes(needle) ||
      new RegExp(`\\b${escapeRegex(col)}\\b`, 'i').test(text) ||
      normalized.includes(`\`${needle}\``)
    );
  };
  const blockingTypes = new Set(['PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK']);
  (usage.keyUsage || []).forEach((row) => {
    const direction = row.TABLE_NAME === table ? 'outgoing' : 'incoming';
    const targetColumn = direction === 'outgoing' ? row.COLUMN_NAME : row.REFERENCED_COLUMN_NAME;
    if (!targetColumn) return;
    const entry = ensureEntry(targetColumn);
    const type = row.CONSTRAINT_TYPE || '';
    if (type) entry.constraintTypes.add(type);
    entry.constraints.push({
      name: row.CONSTRAINT_NAME,
      type,
      table: row.TABLE_NAME,
      column: row.COLUMN_NAME,
      referencedTable: row.REFERENCED_TABLE_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
      direction,
    });
    if (blockingTypes.has(type)) {
      entry.hasBlockingConstraint = true;
      entry.blockingReasons.add(
        type === 'PRIMARY KEY'
          ? 'Part of a PRIMARY KEY; consider companion JSON column instead of conversion.'
          : `Constraint ${row.CONSTRAINT_NAME || type} must be handled before conversion.`,
      );
      if (type === 'PRIMARY KEY') entry.primaryKey = true;
    }
  });
  (usage.checkUsage || []).forEach((row) => {
    if (!row.COLUMN_NAME) return;
    const entry = ensureEntry(row.COLUMN_NAME);
    entry.constraints.push({
      name: row.CONSTRAINT_NAME,
      type: row.CONSTRAINT_TYPE || 'CHECK',
      table,
      column: row.COLUMN_NAME,
      direction: 'check',
    });
    entry.hasBlockingConstraint = true;
    entry.constraintTypes.add(row.CONSTRAINT_TYPE || 'CHECK');
    entry.blockingReasons.add(`Check constraint ${row.CONSTRAINT_NAME || ''} impacts this column.`);
  });
  const triggerRegexes = columnNames.map(
    (col) => [col, new RegExp(`\\b${escapeRegex(col)}\\b`, 'i')],
  );
  const routineRegexes = columnNames.map(
    (col) => [col, new RegExp(`\\b${escapeRegex(col)}\\b`, 'i')],
  );
  const checkClauseRegexes = columnNames.map(
    (col) => [col, new RegExp(`\\b${escapeRegex(col)}\\b`, 'i')],
  );
  (usage.triggers || []).forEach((row) => {
    const statement = String(row.ACTION_STATEMENT || '');
    triggerRegexes.forEach(([col, regex]) => {
      if (!regex.test(statement) && !statement.includes(`\`${col}\``) && !matchesColumnRef(statement, col)) return;
      const entry = ensureEntry(col);
      entry.triggers.push({
        name: row.TRIGGER_NAME,
        table: row.EVENT_OBJECT_TABLE,
        timing: row.ACTION_TIMING,
        event: row.EVENT_MANIPULATION,
        statementPreview: statement.slice(0, 160),
      });
      entry.hasBlockingConstraint = true;
      const locationNote =
        row.EVENT_OBJECT_TABLE && row.EVENT_OBJECT_TABLE !== table
          ? ` on table ${row.EVENT_OBJECT_TABLE}`
          : '';
      entry.blockingReasons.add(`Trigger ${row.TRIGGER_NAME}${locationNote} references this column.`);
    });
  });
  (usage.checkClauses || []).forEach((row) => {
    const clause = String(row.CHECK_CLAUSE || '');
    checkClauseRegexes.forEach(([col, regex]) => {
      if (!regex.test(clause) && !matchesColumnRef(clause, col)) return;
      const entry = ensureEntry(col);
      entry.constraints.push({
        name: row.CONSTRAINT_NAME,
        type: 'CHECK',
        table,
        column: col,
        direction: 'check',
        checkClause: clause,
      });
      entry.hasBlockingConstraint = true;
      entry.constraintTypes.add('CHECK');
      entry.blockingReasons.add(
        `Check constraint ${row.CONSTRAINT_NAME || ''} references ${col} (clause snippet: ${clause.slice(0, 120)}...)`,
      );
    });
  });
  (usage.routineRefs || []).forEach((row) => {
    const body = String(row.ROUTINE_DEFINITION || '');
    routineRegexes.forEach(([col, regex]) => {
      if (!regex.test(body) && !matchesColumnRef(body, col)) return;
      const entry = ensureEntry(col);
      entry.hasBlockingConstraint = true;
      entry.blockingReasons.add(
        `Routine ${row.ROUTINE_NAME} (${row.ROUTINE_TYPE}) references this column; review for dynamic constraint/trigger logic.`,
      );
    });
  });
  (usage.viewRefs || []).forEach((row) => {
    const body = String(row.VIEW_DEFINITION || '');
    routineRegexes.forEach(([col, regex]) => {
      if (!regex.test(body) && !matchesColumnRef(body, col)) return;
      const entry = ensureEntry(col);
      entry.hasBlockingConstraint = true;
      entry.blockingReasons.add(
        `View ${row.TABLE_NAME} references this column; check for downstream constraints or dependencies.`,
      );
    });
  });
  return map;
}

export async function listTables() {
  const [rows] = await pool.query('SHOW TABLES');
  if (!Array.isArray(rows) || rows.length === 0) return [];
  const firstKey = Object.keys(rows[0] || {})[0];
  return rows.map((r) => r[firstKey]).filter(Boolean);
}

export async function listColumns(table) {
  const [rows] = await pool.query('SHOW COLUMNS FROM ??', [table]);
  const columnNames = rows.map((row) => row.Field);
  let constraintMap = {};
  try {
    const usage = await loadColumnUsage(table, columnNames);
    constraintMap = buildConstraintMap(table, columnNames, usage);
  } catch {
    constraintMap = {};
  }
  return rows.map((row) => ({
    name: row.Field,
    type: row.Type,
    nullable: row.Null === 'YES',
    key: row.Key,
    defaultValue: row.Default,
    extra: row.Extra,
    constraints: constraintMap[row.Field]?.constraints || [],
    triggers: constraintMap[row.Field]?.triggers || [],
    hasBlockingConstraint: Boolean(constraintMap[row.Field]?.hasBlockingConstraint),
    blockingReasons: Array.from(constraintMap[row.Field]?.blockingReasons || []),
    constraintTypes: Array.from(constraintMap[row.Field]?.constraintTypes || []),
    isPrimaryKey: Boolean(constraintMap[row.Field]?.primaryKey || row.Key === 'PRI'),
  }));
}

function buildConstraintHandling(table, columnName, constraintInfo = {}, backupId) {
  const tableId = escapeId(table);
  const columnId = escapeId(columnName);
  const dropStatements = new Set();
  const recreateStatements = new Set();
  const postStatements = new Set();
  const warnings = [];
  const seen = new Set();
  (constraintInfo.constraints || []).forEach((c) => {
    const constraintKey = `${c.table || table}|${c.name}`;
    if (seen.has(constraintKey)) return;
    seen.add(constraintKey);
    const constraintName = c.name ? escapeId(c.name) : null;
    if ((c.type || '').toUpperCase() === 'PRIMARY KEY') {
      warnings.push(
        `Primary key ${c.name || ''} will block conversion. Consider introducing a surrogate key before migrating ${columnName} to JSON.`,
      );
      return;
    }
    if ((c.type || '').toUpperCase() === 'UNIQUE') {
      if (constraintName) {
        dropStatements.add(`ALTER TABLE ${tableId} DROP INDEX ${constraintName}`);
        if (backupId) {
          postStatements.add(
            `ALTER TABLE ${tableId} ADD CONSTRAINT ${constraintName} UNIQUE (${backupId})`,
          );
        } else {
          recreateStatements.add(
            `-- Recreate UNIQUE constraint ${constraintName} with JSON-aware validation for ${columnId}`,
          );
        }
      }
      return;
    }
    if ((c.type || '').toUpperCase() === 'FOREIGN KEY') {
      const targetTable = c.direction === 'incoming' && c.table ? c.table : table;
      const targetId = escapeId(targetTable);
      if (constraintName) {
        dropStatements.add(`ALTER TABLE ${targetId} DROP FOREIGN KEY ${constraintName}`);
      }
      if (
        backupId &&
        c.direction !== 'incoming' &&
        c.referencedTable &&
        c.referencedColumn &&
        constraintName
      ) {
        postStatements.add(
          `ALTER TABLE ${tableId} ADD CONSTRAINT ${constraintName} FOREIGN KEY (${backupId}) REFERENCES ${escapeId(c.referencedTable)} (${escapeId(c.referencedColumn)})`,
        );
      } else if (c.referencedTable && c.referencedColumn) {
        recreateStatements.add(
          `-- Validate JSON values for ${columnId} against ${escapeId(c.referencedTable)}.${escapeId(c.referencedColumn)} using JSON_TABLE before recreating referential rules`,
        );
      }
      return;
    }
    if ((c.type || '').toUpperCase() === 'CHECK') {
      if (constraintName) {
        dropStatements.add(`ALTER TABLE ${tableId} DROP CHECK ${constraintName}`);
        recreateStatements.add(
          `-- Reintroduce CHECK ${constraintName} with JSON_VALID(${columnId}) AND JSON_TYPE(${columnId}) = 'ARRAY' once data is validated`,
        );
      }
    }
  });
  (constraintInfo.triggers || []).forEach((trg) => {
    if (!trg?.name) return;
    const triggerName = escapeId(trg.name);
    dropStatements.add(`DROP TRIGGER IF EXISTS ${triggerName}`);
    recreateStatements.add(
      `-- Recreate trigger ${triggerName} so it iterates over JSON_ARRAY elements from ${columnId}`,
    );
  });
  return {
    dropStatements: Array.from(dropStatements),
    recreateStatements: Array.from(recreateStatements),
    postStatements: Array.from(postStatements),
    warnings,
  };
}

function buildColumnStatements(table, columnName, columnMeta, options, constraintInfo = {}) {
  const tableId = escapeId(table);
  const columnId = escapeId(columnName);
  const backupName = options.backup ? `${columnName}_scalar_backup` : null;
  const backupId = backupName ? escapeId(backupName) : null;
  const diagnosticQueries = buildDiagnosticQueries(table, columnName);
  const baseType = columnMeta?.type || 'TEXT';
  const action = options.action || 'convert';
  const manualSql = options.customSql || '';
  const statements = [];
  const previewNotes = [];
  const postStatements = [];

  if (constraintInfo.primaryKey && action !== 'companion') {
    return {
      statements,
      preview: {
        column: columnName,
        originalType: columnMeta?.type || 'UNKNOWN',
        exampleBefore: '123',
        exampleAfter: 'unchanged',
        backupColumn: null,
        blocked: true,
        notes:
          'Primary key columns should remain scalar. Use the companion JSON option to preserve the key while adding multi-value storage.',
        diagnosticQueries,
      },
      skipped: true,
      manualSql,
    };
  }

  if (action === 'manual') {
    return {
      statements,
      preview: {
        column: columnName,
        originalType: columnMeta?.type || 'UNKNOWN',
        exampleBefore: '123',
        exampleAfter: 'awaiting manual constraint drop/alter',
        backupColumn: backupName,
        blocked: true,
        notes:
          manualSql?.trim().length > 0
            ? `Manual SQL provided for constraints. Run before converting: ${manualSql}`
            : 'Manual SQL required to drop or alter constraints before conversion.',
        diagnosticQueries,
      },
      skipped: true,
      manualSql,
    };
  }

  if (action === 'companion') {
    const companionName = `${columnName}_json_multi`;
    const companionId = escapeId(companionName);
    statements.push(`ALTER TABLE ${tableId} ADD COLUMN IF NOT EXISTS ${companionId} JSON NULL`);
    statements.push(
      `UPDATE ${tableId} SET ${companionId} = JSON_ARRAY(${columnId}) WHERE ${columnId} IS NOT NULL`,
    );
    statements.push(
      `ALTER TABLE ${tableId} DROP CHECK IF EXISTS ${escapeId(`${companionName}_check`)}`,
    );
    statements.push(
      `ALTER TABLE ${tableId} ADD CONSTRAINT ${escapeId(
        `${companionName}_check`,
      )} CHECK (JSON_VALID(${companionId}) AND JSON_TYPE(${companionId}) = 'ARRAY')`,
    );
    const preview = {
      column: columnName,
      originalType: columnMeta?.type || 'UNKNOWN',
      exampleBefore: '123',
        exampleAfter: '["123"] (companion column)',
        backupColumn: companionName,
        notes:
          'Scalar column retained. A companion JSON column will store multi-value data for this field.',
        diagnosticQueries,
    };
    return { statements, preview, manualSql };
  }

  if (constraintInfo.hasBlockingConstraint && !options.handleConstraints) {
    return {
      statements,
      preview: {
        column: columnName,
        originalType: columnMeta?.type || 'UNKNOWN',
        exampleBefore: '123',
        exampleAfter: 'skipped',
        backupColumn: backupName,
        blocked: true,
        notes:
          'Skipped: column has constraints or triggers. Enable constraint handling to generate drop/recreate statements.',
        diagnosticQueries,
      },
      skipped: true,
    };
  }

  if (constraintInfo.hasBlockingConstraint && options.handleConstraints) {
    const { dropStatements, recreateStatements, warnings, postStatements: afterStatements } =
      buildConstraintHandling(
        table,
        columnName,
        constraintInfo,
        backupId,
      );
    statements.push(...dropStatements);
    if (warnings.length > 0) previewNotes.push(...warnings);
    if (recreateStatements.length > 0) previewNotes.push(...recreateStatements);
    if (afterStatements.length > 0) postStatements.push(...afterStatements);
  }

  if (backupId) {
    statements.push(
      `ALTER TABLE ${tableId} ADD COLUMN IF NOT EXISTS ${backupId} ${baseType} NULL`,
    );
    statements.push(`UPDATE ${tableId} SET ${backupId} = ${columnId}`);
  }

  statements.push(`ALTER TABLE ${tableId} MODIFY COLUMN ${columnId} JSON`);
  const sourceRef = backupId || columnId;
  statements.push(
    `UPDATE ${tableId} SET ${columnId} = JSON_ARRAY(${sourceRef}) WHERE ${sourceRef} IS NOT NULL`,
  );

  const preview = {
    column: columnName,
    originalType: columnMeta?.type || 'UNKNOWN',
    exampleBefore: '123',
    exampleAfter: '["123"]',
    backupColumn: backupName,
    notes: backupName
      ? `Original values will be stored in ${backupName} before conversion.`
      : 'Conversion will run without keeping a dedicated backup column.',
    diagnosticQueries,
  };

  const validationName = `${columnName}_json_check`;
  statements.push(
    `ALTER TABLE ${tableId} DROP CHECK IF EXISTS ${escapeId(validationName)}`,
  );
  statements.push(
    `ALTER TABLE ${tableId} ADD CONSTRAINT ${escapeId(
      validationName,
    )} CHECK (JSON_VALID(${columnId}) AND JSON_TYPE(${columnId}) = 'ARRAY')`,
  );
  if (postStatements.length > 0) {
    statements.push(...postStatements);
  }
  if (constraintInfo?.constraints?.length || constraintInfo?.triggers?.length) {
    preview.notes =
      (preview.notes ? `${preview.notes} ` : '') +
      'Constraints/triggers will be dropped before conversion and listed for recreation with JSON validation.';
  }
  if (previewNotes.length > 0) {
    preview.notes = `${preview.notes || ''} ${previewNotes.join(' ')}`.trim();
  }

  return { statements, preview, manualSql };
}

export function buildConversionPlan(table, columns, metadata, options = {}) {
  const normalizedColumns = normalizeColumnsInput(columns);
  const plan = { statements: [], previews: [] };
  const scriptLines = [];
  const metadataMap = new Map(metadata.map((m) => [m.name, m]));
  normalizedColumns.forEach((col) => {
    const meta = metadataMap.get(col.name) || {};
    const constraintMeta = metadataMap.get(col.name);
    const constraintInfo = constraintMeta?.constraints
      ? {
          constraints: constraintMeta.constraints,
          triggers: constraintMeta.triggers,
          hasBlockingConstraint: constraintMeta.hasBlockingConstraint,
          primaryKey: constraintMeta.isPrimaryKey,
        }
      : {};
    if (col.action === 'skip') {
      plan.previews.push({
        column: col.name,
        originalType: meta?.type || 'UNKNOWN',
        exampleBefore: '—',
        exampleAfter: 'skipped',
        backupColumn: null,
        blocked: Boolean(constraintInfo?.hasBlockingConstraint),
        notes: 'Skipped by admin. Column was left unchanged.',
      });
      scriptLines.push(`-- ${col.name} skipped per admin selection`);
      return;
    }
    const { statements, preview, skipped } = buildColumnStatements(
      table,
      col.name,
      meta,
      {
        ...options,
        handleConstraints: Boolean(col.handleConstraints),
        action: col.action,
        customSql: col.customSql,
      },
      constraintInfo,
    );
    if (col.customSql) {
      scriptLines.push(`-- Manual SQL for ${col.name}: ${col.customSql}`);
    }
    if (!skipped) {
      plan.statements.push(...statements);
      scriptLines.push(...statements);
    }
    plan.previews.push(preview);
  });
  plan.scriptText = scriptLines
    .map((s) => {
      const text = String(s || '').trim();
      if (!text) return null;
      return text.startsWith('--') ? text : `${text};`;
    })
    .filter(Boolean)
    .join('\n');
  return plan;
}

export async function runPlanStatements(statements) {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    for (const stmt of statements) {
      await conn.query(stmt);
    }
    await conn.commit();
  } catch (err) {
    try {
      await conn.rollback();
    } catch {
      // ignore rollback errors
    }
    throw err;
  } finally {
    try {
      conn.release();
    } catch {
      // ignore release errors
    }
  }
}

export async function recordConversionLog(table, columns, scriptText, runBy) {
  await ensureLogTable();
  const columnName = Array.isArray(columns) ? columns.join(',') : String(columns || '');
  const [result] = await pool.query(
    `INSERT INTO json_conversion_log (table_name, column_name, script_text, run_at, run_by)
     VALUES (?, ?, ?, NOW(), ?)`,
    [table, columnName, scriptText, runBy || null],
  );
  return result.insertId;
}

export async function listSavedScripts() {
  await ensureLogTable();
  const [rows] = await pool.query(
    `SELECT id, table_name, column_name, script_text, run_at, run_by
     FROM json_conversion_log
     ORDER BY run_at DESC
     LIMIT 200`,
  );
  return rows;
}

export async function getSavedScript(id) {
  await ensureLogTable();
  const [rows] = await pool.query(
    `SELECT id, table_name, column_name, script_text, run_at, run_by
     FROM json_conversion_log
     WHERE id = ?`,
    [id],
  );
  return rows[0] || null;
}

export async function touchScriptRun(id, runBy) {
  await ensureLogTable();
  await pool.query(
    `UPDATE json_conversion_log
     SET run_at = NOW(), run_by = ?
     WHERE id = ?`,
    [runBy || null, id],
  );
}

export function splitStatements(scriptText) {
  return String(scriptText || '')
    .split(';')
    .map((part) => part.trim())
    .filter(Boolean)
    .map((stmt) => `${stmt};`);
}
