import { pool } from '../../db/index.js';

const TWIN_TABLE_CONFIG = {
  plan_state: {
    table: 'twin_plan_state',
    keyColumns: ['company_id', 'plan_ref_type', 'plan_ref_id'],
  },
  budget_state: {
    table: 'twin_budget_state',
    keyColumns: ['company_id', 'budget_ref_type', 'budget_ref_id', 'period_key'],
  },
  resource_state: {
    table: 'twin_resource_state',
    keyColumns: ['company_id', 'resource_type', 'resource_ref_id'],
  },
  risk_state: {
    table: 'twin_risk_state',
    keyColumns: ['company_id', 'risk_key', 'entity_type', 'entity_ref_id'],
  },
  task_load: {
    table: 'twin_task_load',
    keyColumns: ['company_id', 'empid'],
  },
};

function sanitizeTable(table) {
  return /^[a-z0-9_]+$/i.test(table) ? table : null;
}

function normalizeRecord(record = {}) {
  const copy = { ...record };
  for (const [key, value] of Object.entries(copy)) {
    if (value && typeof value === 'object' && !(value instanceof Date)) {
      copy[key] = JSON.stringify(value);
    }
  }
  return copy;
}

export async function upsertTwinState(twin, record, conn = pool) {
  const cfg = TWIN_TABLE_CONFIG[twin];
  if (!cfg) throw new Error(`Unsupported twin table ${twin}`);
  const table = sanitizeTable(cfg.table);
  if (!table) throw new Error('Unsafe twin table');

  const payload = normalizeRecord(record);
  const columns = Object.keys(payload);
  if (!columns.length) throw new Error('Twin record must include columns');

  const keys = cfg.keyColumns;
  keys.forEach((key) => {
    if (payload[key] === undefined || payload[key] === null || payload[key] === '') {
      throw new Error(`Twin key column ${key} is required for ${twin}`);
    }
  });

  if (table === 'twin_budget_state') {
    const budgetAmount = Number(payload.budget_amount ?? 0);
    const committed = Number(payload.committed_amount ?? 0);
    const actual = Number(payload.actual_amount ?? 0);
    payload.available_amount = budgetAmount - committed - actual;
    payload.variance_amount = actual - budgetAmount;
  }

  const placeholders = columns.map(() => '?').join(', ');
  const setSql = columns
    .filter((col) => !keys.includes(col))
    .map((col) => `\`${col}\` = VALUES(\`${col}\`)`)
    .join(', ');

  const sql = `
    INSERT INTO \`${table}\` (${columns.map((c) => `\`${c}\``).join(', ')})
    VALUES (${placeholders})
    ON DUPLICATE KEY UPDATE
    ${setSql || '\`updated_at\` = CURRENT_TIMESTAMP'}
  `;

  await conn.query(sql, columns.map((col) => payload[col]));
  return { twin, key: keys.reduce((acc, key) => ({ ...acc, [key]: payload[key] }), {}) };
}

export async function listTwinState(twin, companyId, filters = {}, conn = pool) {
  const cfg = TWIN_TABLE_CONFIG[twin];
  if (!cfg) throw new Error(`Unsupported twin table ${twin}`);
  const table = sanitizeTable(cfg.table);
  const clauses = ['company_id = ?', '(deleted_at IS NULL OR deleted_at IN (0, \"\"))'];
  const params = [companyId];

  Object.entries(filters || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    if (!/^[a-z0-9_]+$/i.test(key)) return;
    clauses.push(`\`${key}\` = ?`);
    params.push(value);
  });

  const [rows] = await conn.query(`SELECT * FROM \`${table}\` WHERE ${clauses.join(' AND ')} ORDER BY updated_at DESC LIMIT 500`, params);
  return rows;
}

export { TWIN_TABLE_CONFIG };
