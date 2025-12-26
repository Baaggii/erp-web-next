import { pool } from '../../db/index.js';

function escapeId(name) {
  return `\`${String(name).replace(/`/g, '``')}\``;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function normalizeColumnsInput(columns = []) {
  if (!Array.isArray(columns)) return [];
  return columns
    .map((col) => {
      if (typeof col === 'string') {
        return { name: col, handleConstraints: false, action: 'convert' };
      }
      if (col && typeof col === 'object') {
        const name = col.name || col.column || col.field;
        if (!name) return null;
        const normalized = String(name);
        const action = col.action === 'skip' ? 'skip' : 'convert';
        const handleConstraints =
          col.handleConstraints || col.handle_constraints || col.resolveConstraints;
        return {
          name: normalized,
          handleConstraints: Boolean(handleConstraints),
          action,
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
  const [triggers] = await pool.query(
    `SELECT TRIGGER_NAME,
            EVENT_MANIPULATION,
            ACTION_TIMING,
            ACTION_STATEMENT
       FROM information_schema.TRIGGERS
      WHERE TRIGGER_SCHEMA = DATABASE()
        AND EVENT_OBJECT_TABLE = ?`,
    [table],
  );
  return { keyUsage, checkUsage, triggers, columnNames };
}

function buildConstraintMap(table, columnNames = [], usage = {}) {
  const map = {};
  const ensureEntry = (col) => {
    if (!map[col]) {
      map[col] = {
        constraints: [],
        triggers: [],
        hasBlockingConstraint: false,
      };
    }
    return map[col];
  };
  const blockingTypes = new Set(['PRIMARY KEY', 'UNIQUE', 'FOREIGN KEY', 'CHECK']);
  (usage.keyUsage || []).forEach((row) => {
    const direction = row.TABLE_NAME === table ? 'outgoing' : 'incoming';
    const targetColumn = direction === 'outgoing' ? row.COLUMN_NAME : row.REFERENCED_COLUMN_NAME;
    if (!targetColumn) return;
    const entry = ensureEntry(targetColumn);
    const type = row.CONSTRAINT_TYPE || '';
    entry.constraints.push({
      name: row.CONSTRAINT_NAME,
      type,
      table: row.TABLE_NAME,
      column: row.COLUMN_NAME,
      referencedTable: row.REFERENCED_TABLE_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
      direction,
    });
    if (blockingTypes.has(type)) entry.hasBlockingConstraint = true;
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
  });
  const triggerRegexes = columnNames.map(
    (col) => [col, new RegExp(`\\b${escapeRegex(col)}\\b`, 'i')],
  );
  (usage.triggers || []).forEach((row) => {
    const statement = String(row.ACTION_STATEMENT || '');
    triggerRegexes.forEach(([col, regex]) => {
      if (!regex.test(statement) && !statement.includes(`\`${col}\``)) return;
      const entry = ensureEntry(col);
      entry.triggers.push({
        name: row.TRIGGER_NAME,
        timing: row.ACTION_TIMING,
        event: row.EVENT_MANIPULATION,
        statementPreview: statement.slice(0, 160),
      });
      entry.hasBlockingConstraint = true;
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
  }));
}

function buildConstraintHandling(table, columnName, constraintInfo = {}) {
  const tableId = escapeId(table);
  const columnId = escapeId(columnName);
  const dropStatements = new Set();
  const recreateStatements = new Set();
  const warnings = [];
  const seen = new Set();
  (constraintInfo.constraints || []).forEach((c) => {
    const constraintKey = `${c.table || table}|${c.name}`;
    if (seen.has(constraintKey)) return;
    seen.add(constraintKey);
    const constraintName = c.name ? escapeId(c.name) : null;
    if ((c.type || '').toUpperCase() === 'PRIMARY KEY') {
      dropStatements.add(`ALTER TABLE ${tableId} DROP PRIMARY KEY`);
      recreateStatements.add(
        `-- TODO: Recreate PRIMARY KEY for ${columnId} or introduce surrogate key after JSON migration`,
      );
      warnings.push(
        `Primary key ${c.name || ''} will block conversion. Consider introducing a surrogate key before migrating ${columnName} to JSON.`,
      );
      return;
    }
    if ((c.type || '').toUpperCase() === 'UNIQUE') {
      if (constraintName) {
        dropStatements.add(`ALTER TABLE ${tableId} DROP INDEX ${constraintName}`);
        recreateStatements.add(
          `-- Recreate UNIQUE constraint ${constraintName} with JSON-aware validation for ${columnId}`,
        );
      }
      return;
    }
    if ((c.type || '').toUpperCase() === 'FOREIGN KEY') {
      const targetTable = c.direction === 'incoming' && c.table ? c.table : table;
      const targetId = escapeId(targetTable);
      if (constraintName) {
        dropStatements.add(`ALTER TABLE ${targetId} DROP FOREIGN KEY ${constraintName}`);
      }
      if (c.referencedTable && c.referencedColumn) {
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
    warnings,
  };
}

function buildColumnStatements(table, columnName, columnMeta, options, constraintInfo = {}) {
  const tableId = escapeId(table);
  const columnId = escapeId(columnName);
  const backupName = options.backup ? `${columnName}_scalar_backup` : null;
  const backupId = backupName ? escapeId(backupName) : null;
  const baseType = columnMeta?.type || 'TEXT';
  const statements = [];
  const previewNotes = [];

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
      },
      skipped: true,
    };
  }

  if (constraintInfo.hasBlockingConstraint && options.handleConstraints) {
    const { dropStatements, recreateStatements, warnings } = buildConstraintHandling(
      table,
      columnName,
      constraintInfo,
    );
    statements.push(...dropStatements);
    if (warnings.length > 0) previewNotes.push(...warnings);
    if (recreateStatements.length > 0) previewNotes.push(...recreateStatements);
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
  if (constraintInfo?.constraints?.length || constraintInfo?.triggers?.length) {
    preview.notes =
      (preview.notes ? `${preview.notes} ` : '') +
      'Constraints/triggers will be dropped before conversion and listed for recreation with JSON validation.';
  }
  if (previewNotes.length > 0) {
    preview.notes = `${preview.notes || ''} ${previewNotes.join(' ')}`.trim();
  }

  return { statements, preview };
}

export function buildConversionPlan(table, columns, metadata, options = {}) {
  const normalizedColumns = normalizeColumnsInput(columns);
  const plan = { statements: [], previews: [] };
  const metadataMap = new Map(metadata.map((m) => [m.name, m]));
  normalizedColumns.forEach((col) => {
    const meta = metadataMap.get(col.name) || {};
    const constraintMeta = metadataMap.get(col.name);
    const constraintInfo = constraintMeta?.constraints
      ? {
          constraints: constraintMeta.constraints,
          triggers: constraintMeta.triggers,
          hasBlockingConstraint: constraintMeta.hasBlockingConstraint,
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
      return;
    }
    const { statements, preview, skipped } = buildColumnStatements(
      table,
      col.name,
      meta,
      { ...options, handleConstraints: Boolean(col.handleConstraints) },
      constraintInfo,
    );
    if (!skipped) {
      plan.statements.push(...statements);
    }
    plan.previews.push(preview);
  });
  plan.scriptText = plan.statements.map((s) => `${s};`).join('\n');
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
