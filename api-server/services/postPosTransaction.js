import fs from 'fs/promises';
import path from 'path';
import { pool } from '../../db/index.js';
import { getConfigPath } from '../utils/configPaths.js';

const masterForeignKeyCache = new Map();

function getValue(row, field) {
  const val = row?.[field];
  return val !== undefined && val !== null ? val : undefined;
}

function setValue(target, field, value) {
  if (target && field && (target[field] === undefined || target[field] === null)) {
    target[field] = value;
  }
}

function propagateCalcFields(cfg, data) {
  if (!Array.isArray(cfg.calcFields)) return;
  for (const map of cfg.calcFields) {
    let value;
    for (const cell of map.cells || []) {
      const { table, field } = cell;
      if (!table || !field) continue;
      const tData = data[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          const v = getValue(row, field);
          if (v !== undefined) {
            value = v;
            break;
          }
        }
        if (value !== undefined) break;
      } else {
        const v = getValue(tData, field);
        if (v !== undefined) {
          value = v;
          break;
        }
      }
    }
    if (value === undefined) continue;
    for (const cell of map.cells || []) {
      const { table, field } = cell;
      if (!table || !field) continue;
      const tData = data[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          setValue(row, field, value);
        }
      } else {
        setValue(tData, field, value);
      }
    }
  }
}

function evalPosFormulas(cfg, data) {
  if (!Array.isArray(cfg.posFields)) return;
  for (const pf of cfg.posFields) {
    const parts = pf.parts || [];
    if (!parts.length) continue;
    const [target, ...calc] = parts;
    let val = 0;
    let init = false;
    for (const p of calc) {
      const tData = data[p.table] || {};
      const num = Number(tData[p.field] ?? 0);
      if (p.agg === '=' && !init) {
        val = num;
        init = true;
      } else if (p.agg === '+') {
        val += num;
      } else if (p.agg === '-') {
        val -= num;
      } else if (p.agg === '=') {
        val = num;
      }
    }
    const targetTable = data[target.table];
    if (!targetTable) continue;
    if (Array.isArray(targetTable)) {
      for (const row of targetTable) {
        row[target.field] = val;
      }
    } else {
      targetTable[target.field] = val;
    }
  }
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeSingleEntry(value) {
  if (isPlainObject(value)) return { ...value };
  if (Array.isArray(value)) {
    for (const item of value) {
      if (isPlainObject(item)) return { ...item };
    }
  }
  return {};
}

function normalizeMultiEntry(value) {
  if (Array.isArray(value)) {
    return value.filter((item) => isPlainObject(item)).map((item) => ({ ...item }));
  }
  if (isPlainObject(value)) {
    return [{ ...value }];
  }
  return [];
}

async function getMasterForeignKeyMap(conn, masterTable) {
  if (!masterTable) return new Map();
  if (masterForeignKeyCache.has(masterTable)) {
    return masterForeignKeyCache.get(masterTable);
  }
  const [rows] = await conn.query(
    `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_COLUMN_NAME
       FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = DATABASE()
        AND REFERENCED_TABLE_NAME = ?`,
    [masterTable],
  );
  const map = new Map();
  for (const row of rows) {
    if (!row?.TABLE_NAME || !row?.COLUMN_NAME) continue;
    if (!map.has(row.TABLE_NAME)) map.set(row.TABLE_NAME, []);
    map.get(row.TABLE_NAME).push({
      column: row.COLUMN_NAME,
      referencedColumn: row.REFERENCED_COLUMN_NAME,
    });
  }
  masterForeignKeyCache.set(masterTable, map);
  return map;
}

function applyMasterForeignKeys(table, row, fkMap, masterRow) {
  if (!isPlainObject(row)) return;
  const refs = fkMap.get(table);
  if (!Array.isArray(refs) || refs.length === 0) return;
  for (const ref of refs) {
    const refCol = ref?.referencedColumn;
    if (!ref?.column || !refCol) continue;
    const value = masterRow?.[refCol];
    if (value !== undefined && value !== null) {
      row[ref.column] = value;
    }
  }
}

async function upsertRow(conn, table, row) {
  const cols = Object.keys(row);
  if (!cols.length) return null;
  const placeholders = cols.map(() => '?').join(',');
  const updates = cols.map((c) => `${c}=VALUES(${c})`).join(',');
  const sql = `INSERT INTO ${table} (${cols.join(',')}) VALUES (${placeholders}) ON DUPLICATE KEY UPDATE ${updates}`;
  const params = cols.map((c) => row[c]);
  const [res] = await conn.query(sql, params);
  return res.insertId && res.insertId !== 0 ? res.insertId : row.id;
}

export async function postPosTransaction(
  data,
  sessionInfo = {},
  companyId = 0,
) {
    const { path: cfgPath } = await getConfigPath(
      'posTransactionConfig.json',
      companyId,
    );
  const cfgRaw = await fs.readFile(cfgPath, 'utf8');
  const json = JSON.parse(cfgRaw);
  const cfg = json['POS_Modmarket'];
  if (!cfg) throw new Error('POS_Modmarket config not found');

  const masterTable = cfg.masterTable || 'transactions_pos';
  const masterType = cfg.masterType === 'multi' ? 'multi' : 'single';
  const tableTypeMap = new Map();
  if (masterTable) tableTypeMap.set(masterTable, masterType);
  for (const entry of Array.isArray(cfg.tables) ? cfg.tables : []) {
    const tableName = entry?.table;
    if (!tableName) continue;
    const type = entry.type === 'multi' ? 'multi' : 'single';
    if (type === 'multi') {
      tableTypeMap.set(tableName, 'multi');
    } else if (!tableTypeMap.has(tableName)) {
      tableTypeMap.set(tableName, 'single');
    }
  }

  const rawData = data && typeof data === 'object' ? data : {};
  const inputMasterId = rawData.masterId ?? null;
  const singleEntries =
    rawData.single && typeof rawData.single === 'object' && !Array.isArray(rawData.single)
      ? rawData.single
      : {};
  const multiEntries =
    rawData.multi && typeof rawData.multi === 'object' && !Array.isArray(rawData.multi)
      ? rawData.multi
      : {};

  const mergedData = {};
  const assignNormalized = (table, value) => {
    if (!table || value === undefined || value === null) return;
    const expectedType = tableTypeMap.get(table);
    if (expectedType === 'multi') {
      mergedData[table] = normalizeMultiEntry(value);
    } else if (expectedType === 'single') {
      mergedData[table] = normalizeSingleEntry(value);
    } else if (Array.isArray(value)) {
      mergedData[table] = value
        .filter((item) => isPlainObject(item))
        .map((item) => ({ ...item }));
    } else if (isPlainObject(value)) {
      mergedData[table] = { ...value };
    } else {
      mergedData[table] = value;
    }
  };

  for (const [table, value] of Object.entries(rawData)) {
    if (table === 'masterId' || table === 'single' || table === 'multi') continue;
    assignNormalized(table, value);
  }
  for (const [table, value] of Object.entries(singleEntries)) {
    assignNormalized(table, value);
  }
  for (const [table, value] of Object.entries(multiEntries)) {
    assignNormalized(table, value);
  }

  for (const [table, type] of tableTypeMap.entries()) {
    if (type === 'multi') {
      if (!Array.isArray(mergedData[table])) {
        mergedData[table] = [];
      }
    } else if (!isPlainObject(mergedData[table])) {
      mergedData[table] = {};
    }
  }

  const posDataEntry = mergedData[masterTable];
  const posData = isPlainObject(posDataEntry) ? posDataEntry : {};
  mergedData[masterTable] = posData;
  if (inputMasterId !== null && inputMasterId !== undefined && inputMasterId !== '') {
    posData.id = inputMasterId;
  }

  // Propagate mapped values
  propagateCalcFields(cfg, mergedData);

  // Evaluate formulas
  evalPosFormulas(cfg, mergedData);

  Object.assign(posData, sessionInfo);

  const required = ['pos_date', 'total_amount', 'total_quantity', 'payment_type'];
  for (const f of required) {
    if (posData[f] === undefined || posData[f] === null) {
      throw new Error(`Missing field ${f}`);
    }
  }

  const statusCfg = cfg.statusField || {};
  if (statusCfg.field && statusCfg.created != null) {
    posData[statusCfg.field] = statusCfg.created;
  }

  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const fkMap = await getMasterForeignKeyMap(conn, masterTable);
    const masterId = await upsertRow(conn, masterTable, posData);
    if (masterId !== null && masterId !== undefined) {
      posData.id = masterId;
    }

    const tablesToPersist = Object.keys(mergedData).filter(
      (table) => table && table !== masterTable,
    );
    for (const table of tablesToPersist) {
      const tData = mergedData[table];
      if (!tData) continue;
      if (Array.isArray(tData)) {
        for (const row of tData) {
          if (!isPlainObject(row) || Object.keys(row).length === 0) continue;
          applyMasterForeignKeys(table, row, fkMap, posData);
          await upsertRow(conn, table, row);
        }
      } else if (isPlainObject(tData) && Object.keys(tData).length > 0) {
        applyMasterForeignKeys(table, tData, fkMap, posData);
        await upsertRow(conn, table, tData);
      }
    }

    if (statusCfg.field && statusCfg.beforePost != null) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusCfg.field}=? WHERE id=?`,
        [statusCfg.beforePost, masterId],
      );
    }
    if (statusCfg.field && statusCfg.posted != null) {
      await conn.query(
        `UPDATE ${masterTable} SET ${statusCfg.field}=? WHERE id=?`,
        [statusCfg.posted, masterId],
      );
    }

    await conn.commit();
    return masterId;
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}

export default postPosTransaction;
